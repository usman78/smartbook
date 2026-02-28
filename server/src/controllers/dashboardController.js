const Dashboard = require('../models/dashboardModel');

/**
 * Gets dashboard statistics for a clinic.
 */
const getDashboardStats = async (req, res, next) => {
    try {
        const clinicId = req.user.clinicId;

        if (!clinicId) {
            return res.status(404).json({
                success: false,
                error: 'Clinic not found'
            });
        }

        const stats = await Dashboard.getStats(clinicId);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDashboardStats
};
