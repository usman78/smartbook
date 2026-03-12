const app = require('./app');
const { validateEnv } = require('./utils/envValidator');
const { startPaymentRecoveryJobs } = require('./services/paymentRecoveryService');

// Validate environment variables on startup
validateEnv();

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';

const server = app.listen(PORT, HOST, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

    // Start background jobs
    startPaymentRecoveryJobs();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.log(`Error: ${err.message}`);
    // Close server & exit process
    server.close(() => process.exit(1));
});
