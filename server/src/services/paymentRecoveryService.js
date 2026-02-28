const db = require('../config/db');
const cron = require('node-cron');
const Appointment = require('../models/appointmentModel');
const StripeService = require('./stripeService');
const MailService = require('./mailService');

/**
 * Service to handle background payment processing and recovery.
 */
const startPaymentRecoveryJobs = () => {
    // Run every hour to check for T-7 day hold transitions
    cron.schedule('0 * * * *', async () => {
        console.log('Running T-7 Payment Hold Transition Job...');
        await processPaymentTransitions();
    });

    // Run every 6 hours to check for expired payment recovery windows (48h)
    cron.schedule('0 */6 * * *', async () => {
        console.log('Running 48h Payment Recovery Expiry Job...');
        await processPaymentExpirations();
    });
};

const processPaymentTransitions = async () => {
    try {
        const pendingAppointments = await Appointment.findPendingTransitions();
        console.log(`Found ${pendingAppointments.length} appointments needing payment transition.`);

        for (const appointment of pendingAppointments) {
            await transitionToAuthHold(appointment);
        }
    } catch (error) {
        console.error('Error in processPaymentTransitions:', error);
    }
};

const transitionToAuthHold = async (appointment) => {
    const { id, payment_info, patient_email } = appointment;
    const { customerId, paymentMethodId, amount } = payment_info;

    console.log(`Attempting hold transition for Appointment ${id}...`);

    const result = await StripeService.createHoldFromSavedCard(
        customerId,
        paymentMethodId,
        amount,
        id
    );

    if (result.success) {
        console.log(`Successfully transitioned Appointment ${id} to Auth Hold.`);
        await Appointment.updatePaymentInfo(id, {
            transitioned: true,
            transitionedAt: new Date().toISOString(),
            paymentIntentId: result.paymentIntentId,
            status: 'authorized'
        });
    } else {
        console.warn(`Payment failure for Appointment ${id}: ${result.error}`);

        // 1. Mark status as payment_failed for Admin visibility
        await Appointment.updateStatus(id, 'payment_failed');

        // 2. Update payment info with error details
        await Appointment.updatePaymentInfo(id, {
            transitioned: false,
            transitionAttemptedAt: new Date().toISOString(),
            lastError: result.error,
            recoveryEmailSent: true // Mocking email trigger
        });

        // 3. Trigger Recovery Email
        const fullAppt = await Appointment.getById(id);
        if (fullAppt && fullAppt.patient_email) {
            MailService.sendPaymentRecoveryAlert(
                fullAppt,
                { full_name: fullAppt.patient_name, email: fullAppt.patient_email }
            ).catch(err => console.error('Failed to send payment recovery email:', err));
        }
    }
};

const processPaymentExpirations = async () => {
    try {
        // Find appointments with payment_failed status where recovery email was sent > 48h ago
        const res = await db.query(
            `SELECT id FROM appointments 
       WHERE status = 'payment_failed' 
       AND (payment_info->>'recoveryEmailSent')::boolean = true
       AND updated_at < NOW() - INTERVAL '48 hours'`
        );

        console.log(`[ExpiryJob] Found ${res.rows.length} appointments to cancel.`);

        for (const row of res.rows) {
            console.log(`Auto-cancelling Appointment ${row.id} due to failed payment recovery window.`);
            await Appointment.updateStatus(row.id, 'cancelled_by_clinic');
            await Appointment.updatePaymentInfo(row.id, { autoCancelled: true });
        }
    } catch (error) {
        console.error('Error in processPaymentExpirations:', error);
    }
};

module.exports = {
    startPaymentRecoveryJobs,
    processPaymentTransitions,
    processPaymentExpirations
};
