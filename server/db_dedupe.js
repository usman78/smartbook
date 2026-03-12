const db = require('./src/config/db');

async function deduplicate() {
    try {
        await db.query(`
            DELETE FROM appointment_types a
            USING appointment_types b
            WHERE a.id > b.id
            AND a.name = b.name
            AND a.clinic_id = b.clinic_id;
        `);
        console.log('Successfully removed duplicate appointment types.');
    } catch (e) {
        console.error('Error removing duplicates:', e);
    } finally {
        process.exit(0);
    }
}

deduplicate();
