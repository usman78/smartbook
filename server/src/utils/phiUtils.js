/**
 * PHI (Protected Health Information) Utilities
 * Handles de-identification of data for HIPAA compliance.
 */

/**
 * De-identifies an appointment object for use in "De-identified" emails.
 * Removes the appointment type (medical reason) and specific provider name 
 * if required by the clinic's interpretation of PHI.
 */
const deidentifyAppointment = (appointment) => {
    return {
        confirmationNumber: appointment.id.slice(0, 8).toUpperCase(),
        date: appointment.scheduled_datetime,
        clinicName: appointment.clinic_name,
        clinicPhone: appointment.clinic_phone,
        // Note: We deliberately exclude 'type_name' and 'provider_name' 
        // to comply with de-identified email requirements.
        message: "You have an upcoming appointment. Click the secure link below to view details."
    };
};

/**
 * Checks if PHI (Provider name, Appointment type) can be sent via email
 * based on the patient's consent level.
 */
const canSendPHIEmail = (patientConsent) => {
    if (!patientConsent) return false;
    return patientConsent.emailPHI === true;
};

module.exports = {
    deidentifyAppointment,
    canSendPHIEmail
};
