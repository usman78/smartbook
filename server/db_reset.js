const db = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function resetDb() {
    try {
        await db.query(`
            TRUNCATE TABLE appointments, provider_schedules, appointment_types, providers, admin_users, waitlist, patients CASCADE;
        `);
        console.log('Successfully truncated tables.');

        const seedSql = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf-8');
        await db.query(seedSql);
        console.log('Successfully re-seeded database.');
    } catch (e) {
        console.error('Error resetting db:', e);
    } finally {
        process.exit(0);
    }
}

resetDb();
