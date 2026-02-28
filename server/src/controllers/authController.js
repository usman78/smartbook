const jwt = require('jsonwebtoken');
const AdminUser = require('../models/adminUserModel');

/**
 * Handles admin login and JWT generation.
 */
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide email and password'
            });
        }

        const user = await AdminUser.findByEmail(email);

        if (!user || !(await AdminUser.validatePassword(password, user.password_hash))) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, clinicId: user.clinic_id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            token,
            data: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                clinicId: user.clinic_id,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    login
};
