const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const appointmentController = require('../controllers/appointmentController');

// Clinic Metadata
router.get('/clinics/:slug/providers', bookingController.getProviders);
router.get('/clinics/:slug/appointment-types', bookingController.getAppointmentTypes);
router.get('/clinics/:slug/providers/:providerId/slots', bookingController.getSlots);

// Slot Management
router.post('/slots/reserve', bookingController.reserveSlot);

// Final Booking
router.post('/appointments', bookingController.createBooking);
router.post('/appointments/:id/cancel', appointmentController.cancelAppointment);

module.exports = router;
