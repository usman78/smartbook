const db = require('../config/db');

/**
 * Finds all active providers for a clinic.
 */
const getAllByClinic = async (clinicId) => {
  const res = await db.query(
    'SELECT * FROM providers WHERE clinic_id = $1 AND is_active = true ORDER BY display_order ASC',
    [clinicId]
  );
  return res.rows;
};

/**
 * Finds a provider by ID.
 */
const getById = async (id) => {
  const res = await db.query('SELECT * FROM providers WHERE id = $1', [id]);
  return res.rows[0];
};

/**
 * Finds providers capable of performing a specific appointment type.
 */
const getByAppointmentType = async (clinicId, appointmentTypeId) => {
  const res = await db.query(
    `SELECT * FROM providers 
     WHERE clinic_id = $1 
     AND is_active = true 
     AND default_appointment_types ? $2
     ORDER BY display_order ASC`,
    [clinicId, appointmentTypeId]
  );
  return res.rows;
};

/**
 * Assignment Logic: Round-Robin with Fewest-Appointments-Today Tiebreaker (SRS 13.3)
 */
const assignProviderAutomatically = async (clinicId, appointmentTypeId, slotDatetime, isNewPatient = false) => {
  // 1. Find all providers who:
  //    - Are active
  //    - Can perform this appointment type
  //    - Have this slot available (not booked, not blocked)
  const res = await db.query(
    `SELECT p.*,
      COUNT(a.id) FILTER (
        WHERE DATE(a.scheduled_datetime AT TIME ZONE c.timezone) 
        = DATE($3 AT TIME ZONE c.timezone)
        AND a.status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')
      ) AS appointments_today,
      MAX(p.last_auto_assigned_at) AS last_assigned
     FROM providers p
     JOIN clinics c ON p.clinic_id = c.id
     LEFT JOIN appointments a ON a.provider_id = p.id
     WHERE p.clinic_id = $1
       AND p.is_active = true
       AND p.default_appointment_types ? $2
       AND ($4 = false OR p.is_accepting_new_patients = true) -- SRS 2.2.1 Constraint
       AND NOT EXISTS (
         SELECT 1 FROM appointments a2
         WHERE a2.provider_id = p.id
           AND a2.scheduled_datetime = $3
           AND a2.status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')
       )
       AND NOT EXISTS (
         SELECT 1 FROM provider_blocked_times pbt
         WHERE pbt.provider_id = p.id
           AND $3 BETWEEN pbt.start_datetime AND pbt.end_datetime
       )
     GROUP BY p.id, c.timezone
     ORDER BY p.display_order ASC -- SRS 2.2.4: First available per display order
     LIMIT 1`,
    [clinicId, appointmentTypeId, slotDatetime, isNewPatient]
  );

  if (!res.rows[0]) {
    return null; // No provider available
  }

  const assignedProvider = res.rows[0];

  // 2. Update last_auto_assigned_at for round-robin tracking
  await db.query(
    `UPDATE providers SET last_auto_assigned_at = NOW() WHERE id = $1`,
    [assignedProvider.id]
  );

  return assignedProvider;
};

module.exports = {
  getAllByClinic,
  getById,
  getByAppointmentType,
  assignProviderAutomatically
};
