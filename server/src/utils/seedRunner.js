const fs = require('fs');
const path = require('path');
const db = require('../config/db');

/**
 * Runs the schema and seed scripts to initialize the database.
 */
const runSeeding = async () => {
    try {
        console.log('🔄 Starting Database Seeding...');

        const schemaPath = path.join(__dirname, '../../db/schema.sql');
        const seedPath = path.join(__dirname, '../../db/seed.sql');

        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        const seedSql = fs.readFileSync(seedPath, 'utf8');

        console.log(' - Executing Schema...');
        await db.query(schemaSql);

        console.log(' - Executing Seed Data...');
        await db.query(seedSql);

        console.log('✅ Database Initialization Complete.');
    } catch (error) {
        console.error('❌ Seeding Failed:', error);
        throw error;
    }
};

module.exports = { runSeeding };

// Run if called directly
if (require.main === module) {
    runSeeding().then(() => process.exit(0)).catch(() => process.exit(1));
}
