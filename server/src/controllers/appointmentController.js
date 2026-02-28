const Appointment = require('../models/appointmentModel');
const StripeService = require('../services/stripeService');
const { DateTime } = require('luxon');

/**
 * Public cancellation (via secure link).
 * POST /api/public/appointments/:id/cancel
 */
const cancelAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const appointment = await Appointment.getById(id);

        if (!appointment) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        if (appointment.status === 'cancelled_by_patient' || appointment.status === 'cancelled_by_clinic') {
            return res.status(400).json({ success: false, error: 'Appointment already cancelled' });
        }

        const now = DateTime.now();
        const apptTime = DateTime.fromJSDate(appointment.scheduled_datetime);
        const hoursUntilAppt = apptTime.diff(now, 'hours').hours;

        const paymentInfo = appointment.payment_info || {};
        let stripeResult = { success: true };

        // 24-Hour Rule: Automatic void only if > 24h away
        if (hoursUntilAppt > 24) {
            if (paymentInfo.paymentStrategy === 'auth_hold' && paymentInfo.paymentIntentId) {
                stripeResult = await StripeService.cancelAuthHold(paymentInfo.paymentIntentId);
            } else if (paymentInfo.paymentStrategy === 'delayed_capture' && paymentInfo.setupIntentId) {
                stripeResult = await StripeService.cancelSetupIntent(paymentInfo.setupIntentId);
            }
        } else {
            // Logic for < 24h: Keep hold for manual review
            console.log(`[Cancellation] Appointment ${id} cancelled within 24h. Hold preserved for manual review.`);
        }

        if (!stripeResult.success) {
            return res.status(400).json({ success: false, error: 'Stripe cancellation failed', details: stripeResult.error });
        }

        // Update status
        const updated = await Appointment.updateStatus(id, 'cancelled_by_patient');

        res.json({
            success: true,
            message: hoursUntilAppt > 24 ? 'Appointment cancelled and deposit voided.' : 'Appointment cancelled. Deposit held per 24h policy.',
            data: updated
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Admin: Manually process a no-show charge.
 * POST /api/admin/appointments/:id/no-show
 */
const processNoShow = async (req, res) => {
    try {
        const { id } = req.params;
        const appointment = await Appointment.getById(id);

        if (!appointment) {
            return res.status(404).json({ success: false, error: 'Appointment not found' });
        }

        const paymentInfo = appointment.payment_info || {};
        if (paymentInfo.paymentStrategy !== 'auth_hold' || !paymentInfo.paymentIntentId) {
            return res.status(400).json({ success: false, error: 'No active hold found to capture' });
        }

        const stripeResult = await StripeService.captureHold(paymentInfo.paymentIntentId);
        if (!stripeResult.success) {
            return res.status(400).json({ success: false, error: 'Stripe capture failed', details: stripeResult.error });
        }

        // Update status to no-show
        const updated = await Appointment.updateStatus(id, 'no_show', req.user.id);

        // Update payment info to reflect capture
        await Appointment.updatePaymentInfo(id, { captured: true, capturedAt: new Date().toISOString() });

        res.json({
            success: true,
            message: 'No-show fee captured successfully.',
            data: updated
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    cancelAppointment,
    processNoShow
};
