const db = require('../config/db');
const { generateValidSlots } = require('../utils/timezone');
const crypto = require('crypto');

/**
 * Gets available slots for a provider on a specific date.
 */
const getAvailableSlots = async (providerId, date, clinicId, timezone) => {
    // 1. Generate all possible 30-min slots for the day (e.g., 9 AM - 5 PM)
    const allSlots = generateValidSlots(date, 9, 17);

    // 2. Fetch existing appointments and active reservations for that provider/date
    const existingRes = await db.query(
        `SELECT scheduled_datetime as dt FROM appointments 
     WHERE provider_id = $1 
     AND DATE(scheduled_datetime AT TIME ZONE $2) = DATE($3 AT TIME ZONE $2)
     AND status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')
     UNION
     SELECT slot_datetime as dt FROM slot_reservations
     WHERE provider_id = $1
     AND DATE(slot_datetime AT TIME ZONE $2) = DATE($3 AT TIME ZONE $2)
     AND released_at IS NULL
     AND expires_at > NOW()`,
        [providerId, timezone, date.toJSDate()]
    );

    const blockedTimes = new Set(existingRes.rows.map(r => r.dt.getTime()));

    // 3. Filter out blocked slots
    return allSlots.filter(slot => {
        return !blockedTimes.has(slot.toJSDate().getTime());
    });
};

/**
 * Places a 10-minute reservation on a slot.
 */
const reserveSlot = async (clinicId, providerId, appointmentTypeId, slotDatetime) => {
    // 0. Preliminary DST/Validity check
    const dt = require('luxon').DateTime.fromISO(slotDatetime);
    if (!dt.isValid) {
        throw new Error('INVALID_SLOT: The requested time is invalid in the clinic timezone (e.g., skips due to DST)');
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const res = await db.query(
        `INSERT INTO slot_reservations 
     (clinic_id, provider_id, appointment_type_id, slot_datetime, session_token, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
        [clinicId, providerId, appointmentTypeId, slotDatetime, sessionToken, expiresAt]
    );

    return res.rows[0];
};

/**
 * Validates if a reservation is still active.
 */
const validateReservation = async (sessionToken) => {
    const res = await db.query(
        `SELECT * FROM slot_reservations 
     WHERE session_token = $1 
     AND released_at IS NULL 
     AND expires_at > NOW()`,
        [sessionToken]
    );
    return res.rows[0];
};

/**
 * Releases a reservation (e.g., after booking or explicit cancel).
 */
const releaseReservation = async (sessionToken, appointmentId = null) => {
    await db.query(
        `UPDATE slot_reservations 
     SET released_at = NOW(), 
         converted_to_appointment_id = $2 
     WHERE session_token = $1`,
        [sessionToken, appointmentId]
    );
};

module.exports = {
    getAvailableSlots,
    reserveSlot,
    validateReservation,
    releaseReservation
};
