const db = require('../config/db');

/**
 * Creates a new appointment.
 */
const create = async (appointmentData) => {
    const {
        clinicId,
        providerId,
        patientId,
        appointmentTypeId,
        scheduledDatetime,
        status = 'pending',
        insuranceInfo = {},
        paymentInfo = {}
    } = appointmentData;

    const res = await db.query(
        `INSERT INTO appointments 
     (clinic_id, provider_id, patient_id, appointment_type_id, scheduled_datetime, status, insurance_info, payment_info)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
        [clinicId, providerId, patientId, appointmentTypeId, scheduledDatetime, status, insuranceInfo, paymentInfo]
    );
    return res.rows[0];
};

/**
 * Finds an appointment by ID.
 */
const getById = async (id) => {
    const res = await db.query(
        `SELECT a.*, p.full_name as patient_name, p.email as patient_email, p.communication_consent,
                pr.full_name as provider_name, at.name as type_name,
                c.name as clinic_name, c.address as clinic_address, c.phone as clinic_phone
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN providers pr ON a.provider_id = pr.id
      JOIN appointment_types at ON a.appointment_type_id = at.id
      JOIN clinics c ON a.clinic_id = c.id
      WHERE a.id = $1`,
        [id]
    );
    return res.rows[0];
};

/**
 * Updates an appointment's status.
 */
const updateStatus = async (id, status, userId = null) => {
    const res = await db.query(
        `UPDATE appointments 
     SET status = $1, cancelled_by_user_id = $2, updated_at = NOW() 
     WHERE id = $3 
     RETURNING *`,
        [status, userId, id]
    );
    return res.rows[0];
};

/**
 * Finds appointments needing T-7 hold transition.
 */
const findPendingTransitions = async () => {
    const res = await db.query(
        `SELECT a.*, p.email as patient_email
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     WHERE a.status = 'confirmed' 
     AND (a.payment_info->>'paymentStrategy') = 'delayed_capture'
     AND a.scheduled_datetime <= NOW() + INTERVAL '7 days'
     AND (a.payment_info->>'transitioned') IS NULL`
    );
    return res.rows;
};

/**
 * Updates payment info for an appointment.
 */
const updatePaymentInfo = async (id, paymentInfo) => {
    const res = await db.query(
        `UPDATE appointments 
     SET payment_info = payment_info || $1, updated_at = NOW() 
     WHERE id = $2 
     RETURNING *`,
        [JSON.stringify(paymentInfo), id]
    );
    return res.rows[0];
};

module.exports = {
    create,
    getById,
    updateStatus,
    findPendingTransitions,
    updatePaymentInfo
};
