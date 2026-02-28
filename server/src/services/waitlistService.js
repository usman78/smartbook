const db = require('../config/db');

/**
 * Calculates waitlist priority (SRS 5.2.1).
 */
const calculatePriority = (entry, patient, completedApptCount) => {
    let priority = 0;
    let tier = 'standard';

    // TIER 1: Emergency/Urgent (Priority 100+)
    if (entry.triage_data?.urgency_flag) {
        priority += 100;
        tier = 'urgent';
    }

    // TIER 2: High Priority (Priority 50-99)
    // Simple check for completed appointments
    if (completedApptCount > 0) {
        priority += 50;
        if (tier !== 'urgent') tier = 'high';
    }

    // TIER 3: Standard Priority (Priority 0-49)
    const daysWaiting = Math.floor(
        (Date.now() - new Date(entry.created_at)) / (1000 * 60 * 60 * 24)
    );
    priority += Math.min(daysWaiting, 30); // Cap at 30 days

    // Specific date request (slight boost)
    if (entry.preferred_date) {
        priority += 5;
    }

    return { priority, tier };
};

/**
 * Staggered Notification Logic (SRS 5.2.2).
 */
const staggeredNotify = async (appointmentId) => {
    // 1. Get waitlist entries for this appointment type/clinic
    const res = await db.query(
        `SELECT w.*, p.email, p.full_name 
     FROM waitlist w
     JOIN patients p ON w.patient_id = p.id
     WHERE w.status = 'active'
     ORDER BY w.priority DESC`
    );
    const waitlist = res.rows;

    if (waitlist.length === 0) return { success: true, message: 'Waitlist is empty' };

    // Grouping by tier (Priority logic)
    const urgentTier = waitlist.filter(e => e.tier === 'urgent');
    const highTier = waitlist.filter(e => e.tier === 'high');
    const standardTier = waitlist.filter(e => e.tier === 'standard');

    // Round 1: Urgent (Immediate)
    if (urgentTier.length > 0) {
        console.log(`[Waitlist] Notifying ${urgentTier.length} urgent patients...`);
        // In a real system, we'd call MailService here.
        // For testing, we verify the stagger record creation.

        await db.query(
            `INSERT INTO scheduled_waitlist_notifications (appointment_id, tier, scheduled_for)
             VALUES ($1, 'high', NOW() + INTERVAL '15 minutes')`,
            [appointmentId]
        );
    } else if (highTier.length > 0) {
        console.log(`[Waitlist] No urgent patients. Notifying ${highTier.length} high priority patients...`);
        await db.query(
            `INSERT INTO scheduled_waitlist_notifications (appointment_id, tier, scheduled_for)
             VALUES ($1, 'standard', NOW() + INTERVAL '30 minutes')`,
            [appointmentId]
        );
    } else {
        console.log(`[Waitlist] Notifying ${standardTier.length} standard patients...`);
    }

    return { success: true, message: 'Notification process started' };
};

module.exports = {
    calculatePriority,
    staggeredNotify
};
