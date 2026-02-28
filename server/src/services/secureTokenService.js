const db = require('../config/db');
const crypto = require('crypto');

/**
 * Generates a secure, single-use token for viewing appointment details.
 */
const generateToken = async (appointmentId, expiryHours = 24) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const res = await db.query(
        `INSERT INTO secure_appointment_tokens (appointment_id, token, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
        [appointmentId, token, expiresAt]
    );

    return res.rows[0];
};

/**
 * Logic for verifying the token and patient identity (DOB or Last 4 digits of phone).
 */
const verifyTokenAndIdentity = async (token, { dob, phoneDigits }) => {
    // 1. Get token (check expired vs locked correctly)
    const tokenRes = await db.query(
        `SELECT * FROM secure_appointment_tokens WHERE token = $1`,
        [token]
    );
    const tokenRecord = tokenRes.rows[0];

    if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
        throw new Error('TOKEN_INVALID_OR_EXPIRED');
    }
    if (tokenRecord.locked_at) {
        throw new Error('LOCKED');
    }

    // 2. Get patient DOB and phone
    const patientRes = await db.query(
        `SELECT p.date_of_birth, p.phone FROM patients p
     JOIN appointments a ON a.patient_id = p.id
     WHERE a.id = $1`,
        [tokenRecord.appointment_id]
    );
    const patientData = patientRes.rows[0];

    if (!patientData) {
        throw new Error('PATIENT_NOT_FOUND');
    }

    // 3. Compare Identity
    let verified = false;

    if (dob) {
        const inputDOB = new Date(dob).toISOString().split('T')[0];
        const actualDOB = new Date(patientData.date_of_birth).toISOString().split('T')[0];
        if (inputDOB === actualDOB) verified = true;
    }

    if (!verified && phoneDigits) {
        // Extract last 4 digits from patient phone - remove non-digits
        const last4Actual = patientData.phone.replace(/\D/g, '').slice(-4);
        const last4Input = phoneDigits.replace(/\D/g, '').slice(-4);
        if (last4Actual === last4Input) verified = true;
    }

    if (!verified) {
        // Increment failed attempts
        const newAttempts = tokenRecord.failed_attempts + 1;
        if (newAttempts >= 3) {
            await db.query(
                'UPDATE secure_appointment_tokens SET failed_attempts = $1, locked_at = NOW() WHERE id = $2',
                [newAttempts, tokenRecord.id]
            );
            throw new Error('LOCKED');
        } else {
            await db.query(
                'UPDATE secure_appointment_tokens SET failed_attempts = $1 WHERE id = $2',
                [newAttempts, tokenRecord.id]
            );
            throw new Error(`VERIFICATION_FAILED|${3 - newAttempts}`);
        }
    }

    // 4. Success - Mark as accessed
    await db.query(
        'UPDATE secure_appointment_tokens SET accessed_at = NOW() WHERE id = $1',
        [tokenRecord.id]
    );

    return tokenRecord.appointment_id;
};

module.exports = {
    generateToken,
    verifyTokenAndIdentity
};
