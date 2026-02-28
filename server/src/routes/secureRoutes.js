const express = require('express');
const router = express.Router();
const secureController = require('../controllers/secureController');

// Secure Appointment Verification
router.post('/appointment/:token/verify', secureController.verifyIdentity);

module.exports = router;
