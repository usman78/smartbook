const nodemailer = require('nodemailer');
const { deidentifyAppointment, canSendPHIEmail } = require('../utils/phiUtils');
const { DateTime } = require('luxon');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Higher-level email sending utility.
 */
const sendEmail = async ({ to, subject, html }) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.FROM_EMAIL,
            to,
            subject,
            html
        });
        console.log(`Email sent: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Sends a booking confirmation email.
 * Respects HIPAA de-identification rules.
 */
const sendBookingConfirmation = async (appointment, patient) => {
    const hasConsent = patient.communication_consent?.emailPHI === true;
    const deidentified = deidentifyAppointment(appointment);
    const dateStr = DateTime.fromJSDate(appointment.scheduled_datetime).toFormat('f');

    let content = `
        <h1>Appointment Confirmation</h1>
        <p>Dear ${patient.full_name},</p>
        <p>Your appointment for <strong>${dateStr}</strong> is confirmed.</p>
        <p><strong>Clinic:</strong> ${appointment.clinic_name}</p>
        <p><strong>Address:</strong> ${appointment.clinic_address}</p>
    `;

    if (hasConsent) {
        content += `
            <p><strong>Provider:</strong> ${appointment.provider_name}</p>
            <p><strong>Treatment:</strong> ${appointment.type_name}</p>
        `;
    } else {
        content += `<p><em>Note: For your privacy, medical details are hidden. Use the link below to view full details.</em></p>`;
    }

    content += `
        <p><a href="${process.env.PUBLIC_URL}/secure/login?token=${appointment.secure_token}">Manage Your Appointment</a></p>
        <p>If you need to cancel, please do so at least 24 hours in advance to avoid a no-show fee.</p>
    `;

    return sendEmail({
        to: patient.email,
        subject: `Appointment Confirmation - ${appointment.clinic_name}`,
        html: content
    });
};

/**
 * Sends an alert if insurance verification fails or requires action.
 */
const sendInsuranceAlert = async (appointment, patient, issue) => {
    const content = `
        <h1>Insurance Verification Update</h1>
        <p>Dear ${patient.full_name},</p>
        <p>We were unable to verify your insurance automatically for your upcoming appointment on <strong>${DateTime.fromJSDate(appointment.scheduled_datetime).toFormat('f')}</strong>.</p>
        <p><strong>Issue:</strong> ${issue || 'Requires manual review'}</p>
        <p><strong>Action Required:</strong> Please bring your physical insurance card to the clinic. You may also update your info via the secure link below.</p>
        <p><a href="${process.env.PUBLIC_URL}/secure/login?token=${appointment.secure_token}">View Appointment Details</a></p>
    `;

    return sendEmail({
        to: patient.email,
        subject: `Action Required: Insurance Verification - ${appointment.clinic_name}`,
        html: content
    });
};

/**
 * Sends an alert if the T-7 payment transition fails.
 */
const sendPaymentRecoveryAlert = async (appointment, patient) => {
    const content = `
        <h1>Action Required: Payment Card Refused</h1>
        <p>Dear ${patient.full_name},</p>
        <p>We attempted to place a security hold on your saved card for your appointment on <strong>${DateTime.fromJSDate(appointment.scheduled_datetime).toFormat('f')}</strong>, but the transaction was declined.</p>
        <p><strong>Action Required:</strong> To keep your appointment, please update your payment method within 24 hours.</p>
        <p><a href="${process.env.PUBLIC_URL}/secure/login?token=${appointment.secure_token}">Update Payment Method</a></p>
        <p>Failure to update your card may result in automatic cancellation of your appointment.</p>
    `;

    return sendEmail({
        to: patient.email,
        subject: `IMPORTANT: Update Payment Method - ${appointment.clinic_name}`,
        html: content
    });
};

module.exports = {
    sendBookingConfirmation,
    sendInsuranceAlert,
    sendPaymentRecoveryAlert
};
