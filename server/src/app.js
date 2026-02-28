const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { Settings } = require('luxon');
require('dotenv').config();

const app = express();

// Set global timezone for Luxon
Settings.defaultZone = 'UTC';

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.tailwindcss.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https://*"],
            frameSrc: ["'self'", "https://js.stripe.com"],
            connectSrc: ["'self'", "https://api.stripe.com"]
        }
    }
}));

// Rate Limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per window
    message: { success: false, error: 'Too many attempts, please try again after 15 minutes' }
});

const verificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 verification attempts per hour
    message: { success: false, error: 'Too many verification attempts, please try again later' }
});

app.use(cors());
app.use(express.json());

// Serve static files from the root directory folders
const rootDir = path.join(__dirname, '../../');
app.use(express.static(path.join(rootDir, 'stitch_assets')));
app.use('/styles', express.static(path.join(rootDir, 'styles')));
app.use('/js', express.static(path.join(rootDir, 'js')));

// Routes
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const secureRoutes = require('./routes/secureRoutes');
const authRoutes = require('./routes/authRoutes');

// Public API
app.use('/api/public', publicRoutes);

// Admin API
app.use('/api/admin', adminRoutes);

// Auth API (Rate limited)
app.use('/api/auth', authLimiter, authRoutes);

// Secure API (Rate limited)
app.use('/api/secure', verificationLimiter, secureRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Admin API
// app.use('/api/admin', adminRoutes);

// Public API
// app.use('/api/public', publicRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = app;
