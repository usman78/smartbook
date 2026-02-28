const Provider = require('../models/providerModel');
const Patient = require('../models/patientModel');
const WaitlistService = require('../services/waitlistService');
const db = require('../config/db');

/**
 * GET /api/admin/providers
 */
const getProviders = async (req, res) => {
    try {
        const { clinicId } = req.query; // Usually from auth token
        const providers = await Provider.getAllByClinic(clinicId);
        res.json({ success: true, data: providers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/providers
 */
const createProvider = async (req, res) => {
    try {
        const { clinicId, fullName, title, specialization, defaultAppointmentTypes } = req.body;

        const resProvider = await db.query(
            `INSERT INTO providers (clinic_id, full_name, title, specialization, default_appointment_types)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [clinicId, fullName, title, specialization, JSON.stringify(defaultAppointmentTypes)]
        );

        res.json({ success: true, data: resProvider.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/admin/providers/:id/schedule
 */
const getProviderSchedule = async (req, res) => {
    try {
        const schedule = await db.query(
            'SELECT * FROM provider_schedules WHERE provider_id = $1 AND is_active = true',
            [req.params.id]
        );
        res.json({ success: true, data: schedule.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * PUT /api/admin/providers/:id/schedule
 */
const updateProviderSchedule = async (req, res) => {
    try {
        const { schedules } = req.body; // Array of {dayOfWeek, startTime, endTime}
        const providerId = req.params.id;

        // Transaction to update multiple schedule rows
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // Deactivate old schedules
            await client.query('UPDATE provider_schedules SET is_active = false WHERE provider_id = $1', [providerId]);

            // Insert new schedules
            for (const s of schedules) {
                await client.query(
                    `INSERT INTO provider_schedules (clinic_id, provider_id, day_of_week, start_time, end_time)
           SELECT clinic_id, $1, $2, $3, $4 FROM providers WHERE id = $1`,
                    [providerId, s.dayOfWeek, s.startTime, s.endTime]
                );
            }

            await client.query('COMMIT');
            res.json({ success: true, message: 'Schedule updated successfully' });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};



/**
 * GET /api/admin/waitlist
 */
const getWaitlist = async (req, res) => {
    try {
        const { clinicId } = req.query;
        const waitlist = await db.query(
            `SELECT w.*, p.full_name as patient_name, at.name as type_name
       FROM waitlist w
       JOIN patients p ON w.patient_id = p.id
       JOIN appointment_types at ON w.appointment_type_id = at.id
       WHERE w.clinic_id = $1 AND w.status = 'active'
       ORDER BY w.priority DESC`,
            [clinicId]
        );
        res.json({ success: true, data: waitlist.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/waitlist/notify-staggered
 */
const notifyWaitlist = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        const result = await WaitlistService.staggeredNotify(appointmentId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/patients/merge
 */
const mergePatients = async (req, res) => {
    try {
        const { keepId, mergeFromId } = req.body;
        if (!keepId || !mergeFromId) {
            return res.status(400).json({ success: false, error: 'Both keepId and mergeFromId are required' });
        }

        await Patient.mergePatients(keepId, mergeFromId);
        res.json({ success: true, message: 'Patients merged successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    getProviders,
    createProvider,
    getProviderSchedule,
    updateProviderSchedule,
    getWaitlist,
    notifyWaitlist,
    mergePatients
};
