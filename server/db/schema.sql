-- SmartBook Database Schema v2.1

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clinics Table
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  phone VARCHAR(20),
  address TEXT,
  base_url VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Providers Table
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  title VARCHAR(100),
  specialization VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  default_appointment_types JSONB, -- Array of appointment_type_ids
  booking_buffer_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_accepting_new_patients BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  last_auto_assigned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider Schedules
CREATE TABLE IF NOT EXISTS provider_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  appointment_type_ids JSONB,
  effective_from DATE,
  effective_until DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider Blocked Times
CREATE TABLE IF NOT EXISTS provider_blocked_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Patients Table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,
  communication_consent JSONB, -- {emailConsent: bool, emailPHI: bool, consentedAt: date, consentIP: string}
  is_shared_email_account BOOLEAN DEFAULT false,
  no_show_count INTEGER DEFAULT 0,
  is_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appointment Types
CREATE TABLE IF NOT EXISTS appointment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  duration INTEGER NOT NULL, -- minutes
  category VARCHAR(50) NOT NULL, -- 'medical', 'cosmetic'
  deposit_amount DECIMAL(10, 2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
  scheduled_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'completed', 'cancelled_by_patient', 'cancelled_by_clinic', 'no_show'
  insurance_info JSONB,
  payment_info JSONB,
  cancellation_reason VARCHAR(255),
  cancelled_by_user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waitlist Table
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
  preferred_date DATE,
  preferred_provider_id UUID REFERENCES providers(id),
  priority INTEGER DEFAULT 0,
  tier VARCHAR(20) DEFAULT 'standard', -- 'urgent', 'high', 'standard'
  triage_data JSONB,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'notified', 'expired', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scheduled Waitlist Notifications
CREATE TABLE IF NOT EXISTS scheduled_waitlist_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  tier VARCHAR(20) NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Secure Appointment Tokens
CREATE TABLE IF NOT EXISTS secure_appointment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accessed_at TIMESTAMP WITH TIME ZONE,
  access_ip INET,
  verification_method VARCHAR(20) DEFAULT 'dob',
  failed_attempts INTEGER DEFAULT 0,
  locked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Slot Reservations
CREATE TABLE IF NOT EXISTS slot_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  slot_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
  session_token VARCHAR(64) NOT NULL UNIQUE,
  reserved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  converted_to_appointment_id UUID REFERENCES appointments(id),
  released_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clinics_slug ON clinics(slug);
CREATE INDEX IF NOT EXISTS idx_providers_clinic ON providers(clinic_id);
CREATE INDEX IF NOT EXISTS idx_provider_schedules_provider ON provider_schedules(provider_id);
CREATE INDEX IF NOT EXISTS idx_patients_email_dob ON patients(clinic_id, LOWER(email), date_of_birth);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_waitlist_priority ON waitlist(priority DESC);
CREATE INDEX IF NOT EXISTS idx_slot_reservations_expiry ON slot_reservations(expires_at) WHERE released_at IS NULL;
-- Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for authentication lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_clinic_id ON admin_users(clinic_id);
