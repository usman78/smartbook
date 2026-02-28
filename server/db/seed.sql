-- Seed Data for SmartBook MVP

-- 1. Create a Clinic
INSERT INTO clinics (name, slug, timezone, phone, address, base_url)
VALUES ('Elite Medical Spa', 'elite-med-spa', 'America/New_York', '(555) 123-4567', '123 Health Ave, New York, NY 10001', 'https://elite.example.com')
ON CONFLICT (slug) DO NOTHING;

-- Get the clinic ID (Assuming it's the only one or we know the slug)
-- For seeding, we can use a subquery or temporary variables if supported, 
-- but simpler to just use the slug in subsequent inserts if we had slug refs.
-- Here we'll use a DO block for sequential inserts with IDs.

DO $$
DECLARE
    clinic_id UUID;
    provider_1_id UUID;
    provider_2_id UUID;
    type_botox_id UUID;
    type_consult_id UUID;
BEGIN
    SELECT id INTO clinic_id FROM clinics WHERE slug = 'elite-med-spa';

    -- 2. Create Appointment Types
    INSERT INTO appointment_types (clinic_id, name, duration, category, deposit_amount)
    VALUES (clinic_id, 'Botox Treatment', 30, 'cosmetic', 50.00)
    RETURNING id INTO type_botox_id;

    INSERT INTO appointment_types (clinic_id, name, duration, category, deposit_amount)
    VALUES (clinic_id, 'Specialist Consultation', 45, 'medical', 0.00)
    RETURNING id INTO type_consult_id;

    -- 3. Create Providers
    INSERT INTO providers (clinic_id, full_name, title, specialization, email, default_appointment_types)
    VALUES (clinic_id, 'Dr. Sarah Jenkins', 'Medical Director', 'Dermatology', 'sarah.jenkins@example.com', jsonb_build_array(type_botox_id, type_consult_id))
    RETURNING id INTO provider_1_id;

    INSERT INTO providers (clinic_id, full_name, title, specialization, email, default_appointment_types)
    VALUES (clinic_id, 'Dr. Michael Chen', 'Senior Clinician', 'Aesthetics', 'michael.chen@example.com', jsonb_build_array(type_botox_id))
    RETURNING id INTO provider_2_id;

    -- 4. Create Provider Schedules (Monday - Friday, 9 AM - 5 PM)
    INSERT INTO provider_schedules (clinic_id, provider_id, day_of_week, start_time, end_time, appointment_type_ids)
    SELECT clinic_id, provider_1_id, d, '09:00:00', '17:00:00', jsonb_build_array(type_botox_id, type_consult_id)
    FROM generate_series(1, 5) d;

    INSERT INTO provider_schedules (clinic_id, provider_id, day_of_week, start_time, end_time, appointment_type_ids)
    SELECT clinic_id, provider_2_id, d, '10:00:00', '18:00:00', jsonb_build_array(type_botox_id)
    FROM generate_series(1, 5) d;

    -- 5. Create a Test Patient
    INSERT INTO patients (id, clinic_id, full_name, email, phone, date_of_birth, communication_consent)
    VALUES ('a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d1', clinic_id, 'John Doe', 'john.doe@example.com', '(555) 987-6543', '1985-05-15', '{"emailConsent": true, "emailPHI": true}')
    ON CONFLICT (id) DO NOTHING;

    -- 6. Create a Default Admin User (Password: Pass123!)
    INSERT INTO admin_users (clinic_id, email, password_hash, full_name, role)
    VALUES (clinic_id, 'admin@elite.com', '$2b$10$MPZS6dIcT3HD6V8QFdPXHOFccpVtn8fb9bVHIU3u7i6rJO99xnDhG', 'Clinic Admin', 'super_admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

    -- 7. Create Sample Appointments for Dashboard & Insurance Queue
    -- confirmed appointment with amount $150
    INSERT INTO appointments (clinic_id, provider_id, patient_id, appointment_type_id, scheduled_datetime, status, payment_info)
    VALUES (clinic_id, provider_1_id, 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d1', type_botox_id, NOW() + INTERVAL '2 hours', 'confirmed', '{"amount": 150.00, "paymentStrategy": "immediate"}');

    -- confirmed appointment with pending insurance
    INSERT INTO appointments (clinic_id, provider_id, patient_id, appointment_type_id, scheduled_datetime, status, insurance_info)
    VALUES (clinic_id, provider_1_id, 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d1', type_consult_id, NOW() + INTERVAL '1 hour', 'confirmed', '{"verificationStatus": "pending", "provider": "Blue Cross"}');

    -- high urgency insurance
    INSERT INTO appointments (clinic_id, provider_id, patient_id, appointment_type_id, scheduled_datetime, status, insurance_info)
    VALUES (clinic_id, provider_1_id, 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d1', type_consult_id, NOW() + INTERVAL '20 hours', 'confirmed', '{"verificationStatus": "pending", "provider": "Aetna"}');

    -- payment failed
    INSERT INTO appointments (clinic_id, provider_id, patient_id, appointment_type_id, scheduled_datetime, status)
    VALUES (clinic_id, provider_2_id, 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d1', type_botox_id, NOW() - INTERVAL '1 day', 'payment_failed');

END $$;
