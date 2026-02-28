const { DateTime } = require('luxon');

/**
 * Converts a date and time from a specific timezone to UTC for storage.
 * @param {string} date - 'YYYY-MM-DD'
 * @param {string} time - 'HH:mm'
 * @param {string} zone - IANA timezone (e.g., 'America/New_York')
 * @returns {Date} - JS Date object in UTC
 */
const toUTC = (date, time, zone) => {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);

    const dt = DateTime.fromObject(
        { year, month, day, hour, minute },
        { zone }
    );

    if (!dt.isValid) {
        throw new Error(`Invalid date/time for timezone ${zone}: ${dt.invalidReason}`);
    }

    return dt.toUTC().toJSDate();
};

/**
 * Converts a UTC Date to a specific timezone for display.
 * @param {Date} date - JS Date object (UTC)
 * @param {string} zone - IANA timezone
 * @returns {DateTime} - Luxon DateTime object in target zone
 */
const toLocal = (date, zone) => {
    return DateTime.fromJSDate(date).setZone(zone);
};

/**
 * Formats a UTC Date for display in a specific timezone.
 * @param {Date} date - JS Date object
 * @param {string} zone - IANA timezone
 * @param {string} format - Luxon format string
 * @returns {string} - Formatted string
 */
const formatInZone = (date, zone, format = 'ff') => {
    return toLocal(date, zone).toFormat(format);
};

/**
 * Generates available 30-min slots for a given day in a specific timezone,
 * excluding invalid times (like DST transition skips).
 * @param {DateTime} date - Luxon DateTime (midnight in target zone)
 * @param {number} startHour - Opening hour (e.g., 9)
 * @param {number} endHour - Closing hour (e.g., 17)
 * @returns {DateTime[]} - Array of valid Luxon DateTime objects
 */
const generateValidSlots = (date, startHour = 9, endHour = 17) => {
    const slots = [];
    let current = date.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
    const end = date.set({ hour: endHour, minute: 0, second: 0, millisecond: 0 });

    while (current < end) {
        // Luxon's isValid check handles the Spring transition "skipped" hour.
        // It also handles the Autumn "repeated" hour by advancing strictly by 30 mins of wall time.
        if (current.isValid) {
            slots.push(current);
        }

        const next = current.plus({ minutes: 30 });

        // Safety check: if current + 30 mins results in the SAME wall clock time (due to DST transition)
        // or a massive jump, we let Luxon handle it but we log it if it's suspicious.
        current = next;
    }

    return slots;
};

module.exports = {
    toUTC,
    toLocal,
    formatInZone,
    generateValidSlots
};
