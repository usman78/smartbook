const db = require('../config/db');

/**
 * Aggregates statistics for the admin dashboard.
 */
const getStats = async (clinicId) => {
    // 1. Total Bookings (all time)
    const totalBookings = await db.query(
        'SELECT COUNT(*) FROM appointments WHERE clinic_id = $1',
        [clinicId]
    );

    // 2. Total Revenue (Total captured or authorized amounts)
    const revenue = await db.query(
        `SELECT SUM((payment_info->>'amount')::numeric) as total
         FROM appointments 
         WHERE clinic_id = $1 
         AND (status = 'confirmed' OR status = 'completed')`,
        [clinicId]
    );

    // 3. Pending Insurance Verifications
    const pendingInsurance = await db.query(
        `SELECT COUNT(*) FROM appointments 
         WHERE clinic_id = $1 
         AND status = 'confirmed'
         AND (insurance_info->>'verificationStatus') = 'pending'`,
        [clinicId]
    );

    // 4. Failed Payments (Flagged in Phase 6)
    const failedPayments = await db.query(
        "SELECT COUNT(*) FROM appointments WHERE clinic_id = $1 AND status = 'payment_failed'",
        [clinicId]
    );

    return {
        totalBookings: parseInt(totalBookings.rows[0].count),
        totalRevenue: parseFloat(revenue.rows[0].total || 0),
        pendingInsurance: parseInt(pendingInsurance.rows[0].count),
        failedPayments: parseInt(failedPayments.rows[0].count)
    };
};

module.exports = {
    getStats
};
