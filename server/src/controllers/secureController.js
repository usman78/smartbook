const SecureTokenService = require('../services/secureTokenService');
const Appointment = require('../models/appointmentModel');

/**
 * POST /api/secure/appointment/:token/verify
 * Verifies the DOB or Phone for a secure link.
 */
const verifyIdentity = async (req, res) => {
    try {
        const { token } = req.params;
        const { dob, phoneDigits } = req.body;

        const appointmentId = await SecureTokenService.verifyTokenAndIdentity(token, { dob, phoneDigits });

        // Success - fetch full details
        const appointment = await Appointment.getById(appointmentId);

        res.json({
            success: true,
            data: {
                confirmationNumber: appointment.id.slice(0, 8).toUpperCase(),
                appointmentType: appointment.type_name,
                date: appointment.scheduled_datetime,
                provider: appointment.provider_name,
                clinicAddress: appointment.clinic_address, // Assuming address is in clinic model
                clinicPhone: appointment.clinic_phone
            }
        });
    } catch (error) {
        if (error.message === 'TOKEN_INVALID_OR_EXPIRED') {
            return res.status(401).json({ success: false, error: 'Link expired or invalid' });
        }
        if (error.message === 'LOCKED') {
            return res.status(423).json({ success: false, error: 'Too many failed attempts. Please call the clinic.' });
        }
        if (error.message.startsWith('VERIFICATION_FAILED')) {
            const attemptsRemaining = error.message.split('|')[1];
            return res.status(401).json({
                success: false,
                error: `Verification failed. ${attemptsRemaining} attempts remaining.`
            });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    verifyIdentity
};
