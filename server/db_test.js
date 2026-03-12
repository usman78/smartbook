const db = require('./src/config/db');

async function run() {
    const res = await db.query('SELECT * FROM appointment_types');
    console.log(res.rows);
    process.exit(0);
}

run().catch(console.error);
