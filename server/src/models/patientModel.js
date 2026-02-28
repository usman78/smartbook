const db = require('../config/db');

/**
 * Normalizes a string for fuzzy matching.
 */
const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/[^\w\s]/g, '') // remove special chars
        .replace(/\s+/g, ' ')    // collapse whitespace
        .replace(/\b(dr|mr|mrs|ms|jr|sr|ii|iii)\b/g, '') // remove titles/suffixes
        .trim();
};

/**
 * Normalizes a phone number for matching.
 */
const normalizePhone = (phone) => {
    if (!phone) return '';
    return phone.replace(/\D/g, ''); // remove all non-digits
};

/**
 * Intelligent Patient Matching Logic (SRS v2.1 Unified)
 */
const findOrCreatePatient = async (bookingData, clinicId) => {
    const { fullName, email, phone, dateOfBirth } = bookingData;
    const normalizedName = normalizeString(fullName);
    const normalizedPh = normalizePhone(phone);

    // Step 1: Primary Match (Email + DOB)
    if (dateOfBirth) {
        const dobMatch = await db.query(
            `SELECT * FROM patients 
       WHERE clinic_id = $1 
       AND LOWER(email) = LOWER($2)
       AND date_of_birth = $3`,
            [clinicId, email, dateOfBirth]
        );
        if (dobMatch.rows[0]) {
            // Update name/phone if changed
            await db.query(
                `UPDATE patients SET full_name = COALESCE(NULLIF($1, ''), full_name), 
         phone = COALESCE(NULLIF($2, ''), phone), updated_at = NOW() WHERE id = $3`,
                [fullName, normalizedPh, dobMatch.rows[0].id]
            );
            return { patient: dobMatch.rows[0], isNew: false };
        }
    }

    // Step 2: Fallback Match (Email + Normalized Name) for legacy patients
    const nameMatch = await db.query(
        `SELECT * FROM patients 
     WHERE clinic_id = $1 
     AND LOWER(email) = LOWER($2)
     AND LOWER(full_name) = LOWER($3)`,
        [clinicId, email, fullName]
    );

    if (nameMatch.rows[0]) {
        // Exact match - update phone and DOB if needed
        await db.query(
            `UPDATE patients SET phone = COALESCE($1, phone), 
       date_of_birth = COALESCE($2, date_of_birth), updated_at = NOW() WHERE id = $3`,
            [normalizedPh, dateOfBirth, nameMatch.rows[0].id]
        );
        return { patient: nameMatch.rows[0], isNew: false };
    }

    // Step 3: Shared Email Detection
    const emailOnlyMatch = await db.query(
        `SELECT * FROM patients WHERE clinic_id = $1 AND LOWER(email) = LOWER($2)`,
        [clinicId, email]
    );

    if (emailOnlyMatch.rows.length > 0) {
        // Create new patient with shared email flag
        const newPatient = await createPatient(clinicId, fullName, email, normalizedPh, dateOfBirth, true);
        return { patient: newPatient, isNew: true, isShared: true };
    }

    // Step 4: Phone + Name Fuzzy Match (Same person, changed email)
    // Note: Using a simpler ILIKE check here, but a real production app might use pg_trgm for % similarity
    const phoneMatch = await db.query(
        `SELECT * FROM patients
     WHERE clinic_id = $1 AND phone = $2
     AND LOWER(full_name) ILIKE $3`,
        [clinicId, normalizedPh, `%${normalizedName}%`]
    );

    if (phoneMatch.rows[0]) {
        await db.query(
            `UPDATE patients SET email = $1, date_of_birth = COALESCE($3, date_of_birth), updated_at = NOW() WHERE id = $2`,
            [email, phoneMatch.rows[0].id, dateOfBirth]
        );
        return { patient: phoneMatch.rows[0], isNew: false };
    }

    // Step 5: No match - Create new patient
    const newPatient = await createPatient(clinicId, fullName, email, normalizedPh, dateOfBirth, false);
    return { patient: newPatient, isNew: true };
};

const createPatient = async (clinicId, fullName, email, phone, dateOfBirth, isShared) => {
    const res = await db.query(
        `INSERT INTO patients 
     (clinic_id, full_name, email, phone, date_of_birth, is_shared_email_account, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
        [clinicId, fullName, email, phone, dateOfBirth, isShared]
    );
    return res.rows[0];
};

/**
 * Merges two patient records.
 * Moves all appointments and waitlist entries from mergeFromId to keepId.
 */
const mergePatients = async (keepId, mergeFromId) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Update Appointments
        await client.query(
            'UPDATE appointments SET patient_id = $1 WHERE patient_id = $2',
            [keepId, mergeFromId]
        );

        // 2. Update Waitlist
        await client.query(
            'UPDATE waitlist SET patient_id = $1 WHERE patient_id = $2',
            [keepId, mergeFromId]
        );

        // 3. Delete old patient record
        await client.query('DELETE FROM patients WHERE id = $1', [mergeFromId]);

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Finds a patient by ID.
 */
const getById = async (id) => {
    const res = await db.query('SELECT * FROM patients WHERE id = $1', [id]);
    return res.rows[0];
};

module.exports = {
    getById,
    findOrCreatePatient,
    createPatient,
    normalizePhone,
    mergePatients
};
