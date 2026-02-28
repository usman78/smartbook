const Insurance = require('../services/insuranceService');
const Appointment = require('../models/appointmentModel');
const Patient = require('../models/patientModel');
const MailService = require('../services/mailService');

/**
 * Gets the insurance verification queue for the clinic.
 */
const getInsuranceQueue = async (req, res, next) => {
    try {
        const clinicId = req.user.clinicId; // From authMiddleware
        const status = req.query.status || 'pending';

        const queue = await Insurance.getQueue(clinicId, status);

        res.json({
            success: true,
            data: queue
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Updates the insurance verification status for an appointment.
 */
const updateVerificationStatus = async (req, res, next) => {
    try {
        const { appointmentId, status, notes, copayAmount, requiresPriorAuth } = req.body;

        if (!appointmentId || !status) {
            return res.status(400).json({
                success: false,
                error: 'Please provide appointmentId and status'
            });
        }

        const updatedAppt = await Insurance.updateVerification(
            appointmentId,
            status,
            notes,
            copayAmount,
            requiresPriorAuth
        );

        // Send alert if failed/requires action
        if (status === 'failed' || status === 'requires_action') {
            const appointment = await Appointment.getById(appointmentId);
            if (appointment && appointment.patient_email) {
                MailService.sendInsuranceAlert(
                    appointment,
                    { full_name: appointment.patient_name, email: appointment.patient_email },
                    notes
                ).catch(err => console.error('Failed to send insurance alert email:', err));
            }
        }

        res.json({
            success: true,
            data: updatedAppt
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getInsuranceQueue,
    updateVerificationStatus
};
