const db = require('../config/db');

/**
 * Finds all active appointment types for a clinic.
 */
const getAllByClinic = async (clinicId) => {
    const res = await db.query(
        'SELECT * FROM appointment_types WHERE clinic_id = $1 AND is_active = true',
        [clinicId]
    );
    return res.rows;
};

/**
 * Finds an appointment type by ID.
 */
const getById = async (id) => {
    const res = await db.query('SELECT * FROM appointment_types WHERE id = $1', [id]);
    return res.rows[0];
};

module.exports = {
    getAllByClinic,
    getById
};
