const db = require('../config/db');
const bcrypt = require('bcryptjs');

/**
 * Finds an admin user by email.
 */
const findByEmail = async (email) => {
    const res = await db.query(
        'SELECT * FROM admin_users WHERE email = $1',
        [email]
    );
    return res.rows[0];
};

/**
 * Validates a password against a stored hash.
 */
const validatePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

module.exports = {
    findByEmail,
    validatePassword
};
