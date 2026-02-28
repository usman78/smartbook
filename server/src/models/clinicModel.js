const db = require('../config/db');

/**
 * Finds a clinic by its slug.
 */
const getBySlug = async (slug) => {
    const res = await db.query('SELECT * FROM clinics WHERE slug = $1', [slug]);
    return res.rows[0];
};

/**
 * Finds a clinic by ID.
 */
const getById = async (id) => {
    const res = await db.query('SELECT * FROM clinics WHERE id = $1', [id]);
    return res.rows[0];
};

/**
 * Returns the timezone of a clinic.
 */
const getTimezone = async (clinicId) => {
    const res = await db.query('SELECT timezone FROM clinics WHERE id = $1', [clinicId]);
    return res.rows[0]?.timezone || 'America/New_York';
};

module.exports = {
    getBySlug,
    getById,
    getTimezone
};
