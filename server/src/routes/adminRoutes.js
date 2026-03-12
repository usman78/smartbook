const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const appointmentController = require('../controllers/appointmentController');
const insuranceController = require('../controllers/insuranceController');
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

// All admin routes are protected
router.use(protect);

router.get('/providers', adminController.getProviders);
router.post('/providers', adminController.createProvider);

// Schedule Management
router.get('/providers/:id/schedule', adminController.getProviderSchedule);
router.put('/providers/:id/schedule', adminController.updateProviderSchedule);

// Insurance Verification Queue
router.get('/insurance/queue', insuranceController.getInsuranceQueue);
router.post('/insurance/verify', insuranceController.updateVerificationStatus);

// Appointments
router.get('/appointments/today', adminController.getTodayAppointments);

// Dashboard
router.get('/stats', dashboardController.getDashboardStats);

router.get('/waitlist', adminController.getWaitlist);
router.post('/waitlist/notify-staggered', adminController.notifyWaitlist);

router.post('/patients/merge', adminController.mergePatients);
router.post('/appointments/:id/no-show', appointmentController.processNoShow);

module.exports = router;
