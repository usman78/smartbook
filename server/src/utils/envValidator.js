const requiredEnv = [
    'PORT',
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'JWT_SECRET',
    'DB_USER',
    'DB_HOST',
    'DB_NAME',
    'DB_PASS',
    'DB_PORT'
];

const validateEnv = () => {
    const missing = requiredEnv.filter(key => !process.env[requiredEnv.indexOf(key) === 3 ? 'JWT_SECRET' : requiredEnv[requiredEnv.indexOf(key)]]);
    // The previous line was a bit confusing, let's keep it simple
    const missingKeys = requiredEnv.filter(key => !process.env[key]);

    if (missingKeys.length > 0) {
        console.error('CRITICAL ERROR: Missing required environment variables:');
        missingKeys.forEach(key => console.error(` - ${key}`));
        process.exit(1);
    }

    console.log('✅ Environment variables validated.');
};

module.exports = { validateEnv };
