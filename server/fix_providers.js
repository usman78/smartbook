const db = require('./src/config/db');

async function updateProviders() {
    try {
        const res = await db.query('UPDATE providers SET is_accepting_new_patients = true RETURNING id, full_name, is_accepting_new_patients');
        console.log('Updated Providers:', res.rows);
        process.exit(0);
    } catch (err) {
        console.error('Error updating providers:', err);
        process.exit(1);
    }
}

updateProviders();
