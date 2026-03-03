const Clinic = require('../models/clinicModel');
const Provider = require('../models/providerModel');
const AppointmentType = require('../models/appointmentTypeModel');
const Patient = require('../models/patientModel');
const Appointment = require('../models/appointmentModel');
const SchedulingService = require('../services/schedulingService');
const StripeService = require('../services/stripeService');
const MailService = require('../services/mailService');
const { DateTime } = require('luxon');

/**
 * GET /api/public/clinics/:slug/providers
 * Optional query param: ?appointmentTypeId=<uuid>
 * When provided, only providers qualified for that treatment are returned.
 */
const getProviders = async (req, res) => {
    try {
        const clinic = await Clinic.getBySlug(req.params.slug);
        if (!clinic) return res.status(404).json({ error: 'Clinic not found' });

        const { appointmentTypeId } = req.query;

        let providers;
        if (appointmentTypeId) {
            // Filter: only providers who can perform this treatment
            providers = await Provider.getByAppointmentType(clinic.id, appointmentTypeId);
        } else {
            providers = await Provider.getAllByClinic(clinic.id);
        }

        res.json({ success: true, data: providers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/public/clinics/:slug/appointment-types
 */
const getAppointmentTypes = async (req, res) => {
    try {
        const clinic = await Clinic.getBySlug(req.params.slug);
        if (!clinic) return res.status(404).json({ error: 'Clinic not found' });

        const types = await AppointmentType.getAllByClinic(clinic.id);
        res.json({ success: true, data: types });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/public/slots/reserve
 */
const reserveSlot = async (req, res) => {
    try {
        const { clinicSlug, providerId, appointmentTypeId, slotDatetime, isNewPatient } = req.body;

        const clinic = await Clinic.getBySlug(clinicSlug);
        if (!clinic) return res.status(404).json({ error: 'Clinic not found' });

        // Handle "Any Available" provider (providerId = 'any')
        let targetProviderId = providerId;
        if (providerId === 'any') {
            const assigned = await Provider.assignProviderAutomatically(clinic.id, appointmentTypeId, slotDatetime, isNewPatient);
            if (!assigned) return res.status(409).json({ error: 'No provider available for this slot' });
            targetProviderId = assigned.id;
        }

        const reservation = await SchedulingService.reserveSlot(
            clinic.id,
            targetProviderId,
            appointmentTypeId,
            slotDatetime
        );

        res.json({ success: true, data: reservation });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/public/appointments
 */
const createBooking = async (req, res) => {
    try {
        const { sessionToken, patientData, paymentMethodId } = req.body;

        // 1. Validate Reservation
        const reservation = await SchedulingService.validateReservation(sessionToken);
        if (!reservation) {
            return res.status(409).json({ error: 'Reservation expired or invalid' });
        }

        const clinic = await Clinic.getById(reservation.clinic_id);
        const apptType = await AppointmentType.getById(reservation.appointment_type_id);

        // 2. Find or Create Patient
        const { patient, isNew, isShared } = await Patient.findOrCreatePatient(patientData, clinic.id);

        // 3. Provider Constraints Check
        const provider = await Provider.getById(reservation.provider_id);
        if (isNew && !provider.is_accepting_new_patients) {
            return res.status(403).json({ error: 'This provider is not currently accepting new patients.' });
        }

        // 4. Appointment Type Constraints Check
        const typeIds = Array.isArray(provider.default_appointment_types) ? provider.default_appointment_types : [];
        if (!typeIds.includes(apptType.id)) {
            return res.status(403).json({ error: 'This provider does not perform the selected treatment.' });
        }

        // 5. Process Payment (Hybrid logic)
        let paymentInfo = {};
        if (apptType.category === 'cosmetic' && apptType.deposit_amount > 0) {
            const now = DateTime.now();
            const apptTime = DateTime.fromJSDate(reservation.slot_datetime);
            const daysUntilAppt = apptTime.diff(now, 'days').days;

            if (daysUntilAppt <= 7) {
                paymentInfo = await StripeService.createAuthHold(
                    paymentMethodId,
                    apptType.deposit_amount,
                    'TEMPORARY_ID', // Will update later
                    patient.email
                );
            } else {
                paymentInfo = await StripeService.savePaymentMethodForLater(
                    paymentMethodId,
                    apptType.deposit_amount,
                    'TEMPORARY_ID',
                    patient.email
                );
            }

            if (!paymentInfo.success) {
                return res.status(400).json({ error: 'Payment failed', details: paymentInfo.error });
            }
        }

        // 4. Create Appointment
        const appointment = await Appointment.create({
            clinicId: clinic.id,
            providerId: reservation.provider_id,
            patientId: patient.id,
            appointmentTypeId: apptType.id,
            scheduledDatetime: reservation.slot_datetime,
            status: 'confirmed',
            payment_info: paymentInfo
        });

        // 5. Cleanup Reservation
        await SchedulingService.releaseReservation(sessionToken, appointment.id);

        // 6. Send Confirmation Email (Async)
        const fullAppt = await Appointment.getById(appointment.id);
        const fullClinic = await Clinic.getById(clinic.id);
        MailService.sendBookingConfirmation(
            { ...fullAppt, clinic_name: fullClinic.name, clinic_address: fullClinic.address, clinic_phone: fullClinic.phone },
            patient
        ).catch(err => console.error('Failed to send confirmation email:', err));

        res.json({ success: true, data: appointment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getSlots = async (req, res) => {
    try {
        const { slug, providerId } = req.params;
        const { date } = req.query; // 'YYYY-MM-DD'

        const clinic = await Clinic.getBySlug(slug);
        if (!clinic) return res.status(404).json({ error: 'Clinic not found' });

        const slots = await SchedulingService.getAvailableSlots(
            providerId,
            DateTime.fromISO(date, { zone: clinic.timezone }),
            clinic.id,
            clinic.timezone
        );

        res.json({ success: true, data: slots });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getProviders,
    getAppointmentTypes,
    getSlots,
    reserveSlot,
    createBooking
};
