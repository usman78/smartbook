const db = require('../config/db');

/**
 * Classifies the urgency of insurance verification for a medical appointment.
 * SRS 13.6 logic.
 */
const classifyUrgency = (scheduledDatetime) => {
    const now = new Date();
    const apptTime = new Date(scheduledDatetime);
    const hoursUntilAppt = (apptTime - now) / (1000 * 60 * 60);

    if (hoursUntilAppt <= 2) return 'critical';
    if (hoursUntilAppt <= 24) return 'high';
    if (hoursUntilAppt <= 48) return 'medium';
    return 'standard';
};

/**
 * Updates the insurance status and urgency for an appointment.
 */
const updateVerification = async (appointmentId, status, notes = '', copay = 0, requiresAuth = false) => {
    const res = await db.query(
        `UPDATE appointments 
     SET insurance_info = jsonb_set(
       jsonb_set(
         jsonb_set(
           jsonb_set(
             insurance_info, 
             '{verificationStatus}', $1::jsonb
           ),
           '{verificationNotes}', $2::jsonb
         ),
         '{copayAmount}', $3::jsonb
       ),
       '{requiresPriorAuth}', $4::jsonb
     ),
     updated_at = NOW() 
     WHERE id = $5 
     RETURNING *`,
        [
            JSON.stringify(status),
            JSON.stringify(notes),
            JSON.stringify(copay),
            JSON.stringify(requiresAuth),
            appointmentId
        ]
    );
    return res.rows[0];
};

/**
 * Fetches the insurance verification queue with urgency sorting.
 */
const getQueue = async (clinicId, status = 'pending') => {
    const res = await db.query(
        `SELECT a.*, p.full_name as patient_name, at.name as type_name
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN appointment_types at ON a.appointment_type_id = at.id
     WHERE a.clinic_id = $1 
     AND at.category = 'medical'
     AND (a.insurance_info->>'verificationStatus') = $2
     ORDER BY a.scheduled_datetime ASC`,
        [clinicId, status]
    );

    // Add urgency flag in memory for each record
    return res.rows.map(appt => ({
        ...appt,
        urgency: classifyUrgency(appt.scheduled_datetime)
    }));
};

module.exports = {
    classifyUrgency,
    updateVerification,
    getQueue
};
