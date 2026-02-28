# SmartBook - Software Requirements Specification (SRS)
## Version 2.1 - FINAL | MVP Phase | February 2026

---

# DOCUMENT CONTROL

**Project Name:** SmartBook - Intelligent Appointment Scheduling for Dermatology  
**Document Version:** 2.1 (FINAL)  
**Last Updated:** February 21, 2026  
**Document Owner:** Development Team  
**Status:** Approved for Development  

**Changes from Version 2.0:**
- Added explicit Provider-Treatment mapping management UI requirements
- Updated appointment_type API endpoints to support provider assignment
- Added bi-directional sync requirement for provider qualified treatments

**Changes from Version 1.0:**
- Added multi-provider scheduling to MVP scope
- Added HIPAA-compliant email consent requirements
- Specified clinic cancellation refund logic
- Clarified waitlist priority system with staggered notifications
- Added insurance verification API and workflow
- Detailed patient matching logic
- Explicit timezone storage requirements

---

# 1. EXECUTIVE SUMMARY

## 1.1 Project Overview

SmartBook is a specialized appointment scheduling system designed for small to medium dermatology practices (1-5 providers). The system handles both medical dermatology (insurance-based) and cosmetic services (self-pay with deposits), using intelligent triage to ensure patients book appropriate appointment types and durations.

## 1.2 Critical Requirements Addressed

This SRS explicitly addresses:
1. **Multi-provider scheduling** (essential for target market)
2. **HIPAA-compliant email communications** with patient consent
3. **Complete payment/refund workflows** for all cancellation scenarios
4. **Priority-based waitlist notifications** (not just first-to-claim)
5. **Insurance verification tracking** with admin workflow
6. **Patient matching logic** to prevent duplicate records
7. **Explicit timezone handling** across all operations

## 1.3 MVP Scope (Revised)

**Timeline:** 4 weeks  
**Target Users:** Dermatology practices with 1-5 providers  
**Communication:** Email only (SMS deferred to Phase 2)  

**Core Features (In Scope):**
- ✅ **Multi-provider appointment scheduling** (NEW)
- ✅ Patient booking with smart triage
- ✅ Provider-specific availability management
- ✅ Admin dashboard for appointment management
- ✅ Email confirmations and reminders (HIPAA-compliant)
- ✅ Priority-based waitlist with staggered notifications
- ✅ Stripe integration for cosmetic deposits
- ✅ Insurance information collection and verification tracking
- ✅ Configurable clinic settings

**Explicitly Out of Scope (Phase 2):**
- SMS/WhatsApp communication
- Photo uploads (skin concerns or insurance cards)
- **Automatic** waitlist notifications (manual with staggered timing in MVP)
- Patient accounts with login
- Real-time insurance verification API
- Clinic self-registration flow (Clinics are onboarded via Manual / Super Admin Script)

---

# 2. MULTI-PROVIDER SCHEDULING (MVP REQUIREMENT)

## 2.1 Provider Management

### 2.1.1 Database Schema - Providers Table

```sql
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  
  -- Provider Information
  full_name VARCHAR(255) NOT NULL,
  title VARCHAR(100), -- "Dr.", "PA", "NP", etc.
  specialization VARCHAR(100), -- "Medical Dermatology", "Cosmetic", "Both"
  
  -- Contact (optional, for internal use)
  email VARCHAR(255),
  phone VARCHAR(20),
  
  -- Scheduling Configuration
  default_appointment_types JSONB, -- Array of appointment_type_ids this provider can perform
  -- Example: ["type-uuid-1", "type-uuid-2"]
  
  booking_buffer_minutes INTEGER DEFAULT 0, -- Time needed between appointments for this provider
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_accepting_new_patients BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0, -- Order in provider selection
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_providers_clinic ON providers(clinic_id);
CREATE INDEX idx_providers_active ON providers(clinic_id, is_active);

-- At least one active provider required per clinic
ALTER TABLE clinics ADD CONSTRAINT chk_has_active_provider 
  CHECK (
    EXISTS (
      SELECT 1 FROM providers 
      WHERE providers.clinic_id = clinics.id 
      AND providers.is_active = true
    )
  );
  
-- NEW CONSTRAINT: Soft Delete Only
-- Prevent hard deletion if appointments exist
-- This logic should be enforced via application-level check or a trigger, 
-- but we document the requirement here explicitly.
-- Rule: Providers with distinct appointment history CANNOT be deleted, only deactivated (is_active = false).
```

### 2.1.2 Provider-Specific Schedules

```sql
CREATE TABLE provider_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  
  -- Schedule Definition
  day_of_week INTEGER NOT NULL, -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Optional: Specific appointment types during this time
  appointment_type_ids JSONB, -- NULL = all types, or specific array
  
  -- Date Range (for temporary schedules, vacations)
  effective_from DATE,
  effective_until DATE, -- NULL = ongoing
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_provider_schedules_provider ON provider_schedules(provider_id);
CREATE INDEX idx_provider_schedules_day ON provider_schedules(day_of_week);

-- Prevent overlapping schedules for same provider
CREATE UNIQUE INDEX idx_no_overlapping_schedules 
  ON provider_schedules(provider_id, day_of_week, start_time, end_time)
  WHERE is_active = true AND effective_until IS NULL;
```

### 2.1.3 Provider Blocked Times

```sql
CREATE TABLE provider_blocked_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  
  -- Blocked Period
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  
  reason VARCHAR(255), -- "Vacation", "Conference", "Sick Leave"
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX idx_provider_blocked_times ON provider_blocked_times(provider_id, start_datetime, end_datetime);
```

### 2.1.4 Updated Appointments Table

```sql
-- ADD provider_id to appointments table
ALTER TABLE appointments 
  ADD COLUMN provider_id UUID REFERENCES providers(id);

-- Create index
CREATE INDEX idx_appointments_provider ON appointments(provider_id);

-- Ensure provider belongs to same clinic as appointment
ALTER TABLE appointments 
  ADD CONSTRAINT chk_provider_same_clinic 
  CHECK (
    provider_id IS NULL OR 
    EXISTS (
      SELECT 1 FROM providers 
      WHERE providers.id = appointments.provider_id 
      AND providers.clinic_id = appointments.clinic_id
    )
  );
  );
  
-- Refinement: Explicit Status Definitions
-- The 'status' column in 'appointments' table must adhere to these values:
-- 'pending', 'confirmed', 'completed', 'cancelled_by_patient', 'cancelled_by_clinic', 'no_show'.
-- This ensures consistency with the Scenario Matrix in Section 4.1.1.
```

## 2.2 Provider Selection During Booking

### 2.2.1 Booking Flow - Provider Selection Step

**When does patient select provider?**

**Option A: Patient Chooses Specific Provider**
```
Booking Flow:
1. Patient Status (New/Returning)
2. Appointment Type Selection
3. → PROVIDER SELECTION ← (NEW STEP)
4. Date & Time Selection (filtered by provider availability)
5. Contact Info
6. Confirmation
```

**Option B: System Assigns Based on Availability**
```
Booking Flow:
1. Patient Status
2. Appointment Type Selection
3. Date & Time Selection (shows all providers' availability)
4. Contact Info
5. Confirmation
(Provider assigned automatically to whoever has that slot)
```

**DECISION FOR MVP: Option A (Patient Chooses Provider)**

**Rationale:**
- Patients often have preferences (Dr. Smith vs Dr. Lee)
- Returning patients want to see same provider
- More transparent booking experience
- Aligns with industry standard

### 2.2.2 API Changes for Multi-Provider

**GET /api/public/clinics/:slug/providers**

Get list of providers for patient selection.

**Request:**
```
GET /api/public/clinics/dr-smith-dermatology/providers
```

**Response:**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "provider-uuid-1",
        "fullName": "Dr. Sarah Smith",
        "title": "MD",
        "specialization": "Medical Dermatology",
        "isAcceptingNewPatients": true,
        "appointmentTypes": ["Mole Check", "Acne Treatment", "Rash Evaluation"],
        "photoUrl": null
      },
      {
        "id": "provider-uuid-2",
        "fullName": "Dr. Michael Lee",
        "title": "MD",
        "specialization": "Both",
        "isAcceptingNewPatients": true,
        "appointmentTypes": ["Mole Check", "Botox Treatment", "Laser Hair Removal"],
        "photoUrl": null
      }
    ]
  }
}
```

**POST /api/public/triage (Updated)**

Now includes provider_id in request.

**Request:**
```json
{
  "clinicSlug": "dr-smith-dermatology",
  "patientStatus": "new",
  "appointmentTypeId": "type-uuid-1",
  "providerId": "provider-uuid-1", ← NEW
  "preferredDate": "2026-02-20"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "provider": {
      "id": "provider-uuid-1",
      "fullName": "Dr. Sarah Smith"
    },
    "appointmentType": {
      "id": "type-uuid-1",
      "name": "Mole Check",
      "duration": 30
    },
    "availableSlots": [
      {
        "datetime": "2026-02-20T14:00:00Z",
        "displayTime": "2:00 PM EST",
        "providerId": "provider-uuid-1",
        "providerName": "Dr. Sarah Smith"
      }
      // ... more slots
    ]
  }
}
```

### 2.2.3 Slot Calculation Logic (Multi-Provider)

```javascript
// Pseudo-code for calculating available slots with multiple providers
function calculateAvailableSlotsMultiProvider(clinic, appointmentType, providerId, date) {
  // 1. Get provider's schedule for the day
  const dayOfWeek = getDayOfWeek(date);
  const providerSchedule = getProviderSchedule(providerId, dayOfWeek);
  
  // 2. Check if date is blocked for provider
  if (isProviderBlocked(providerId, date)) {
    return [];
  }
  
  // 3. Check if date is clinic-wide blocked
  if (isClinicBlockedDate(clinic.id, date)) {
    return [];
  }
  
  // 4. Generate slots based on provider's schedule
  const slots = [];
  for (const timeRange of providerSchedule) {
    let currentTime = combineDateTime(date, timeRange.start_time);
    const endTime = combineDateTime(date, timeRange.end_time);
    
    while (currentTime + appointmentType.duration <= endTime) {
      // 5. Check if THIS PROVIDER has an appointment at this time
      const isProviderBooked = await db.query(
        `SELECT 1 FROM appointments 
         WHERE provider_id = $1 
         AND scheduled_datetime = $2 
         AND status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')`,
        [providerId, currentTime]
      );
      
      // 6. Check minimum booking notice
      const hoursUntilSlot = (currentTime - Date.now()) / (1000 * 60 * 60);
      const meetsNotice = hoursUntilSlot >= clinic.settings.minBookingNoticeHours;
      
      if (!isProviderBooked && meetsNotice) {
        slots.push({
          datetime: currentTime.toISOString(),
          providerId: providerId,
          displayTime: formatTime(currentTime, clinic.timezone),
          displayDate: formatDate(currentTime, clinic.timezone)
        });
      }
      
      // Move to next slot (duration + provider's buffer time)
      currentTime = addMinutes(currentTime, appointmentType.duration + provider.booking_buffer_minutes);
    }
  }
  
  return slots;
}
```

### 2.2.4 UI Wireframe - Provider Selection

```
┌────────────────────────────────────────────────────┐
│  [← Back] Dr. Smith Dermatology        Step 3 of 6 │
├────────────────────────────────────────────────────┤
│                                                     │
│  Select your provider                               │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 👨‍⚕️ Dr. Sarah Smith, MD                        │  │
│  │    Medical Dermatology                        │  │
│  │    ⭐ Accepting new patients                  │  │
│  │    Performs: Mole Check, Acne, Rash          │  │
│  │                                    [Select]   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 👨‍⚕️ Dr. Michael Lee, MD                        │  │
│  │    Medical & Cosmetic Dermatology            │  │
│  │    ⭐ Accepting new patients                  │  │
│  │    Performs: All services                    │  │
│  │                                    [Select]   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ℹ️  You can request a specific provider, but     │
│     availability may be more limited.             │
│                                                     │
│  [← Back]                        [Any Available]   │
│                                                     │
│  ●●●○○○                                           │
└────────────────────────────────────────────────────┘
```

**"Any Available" Option:**
- Shows combined availability across all providers who can perform the appointment type
- System assigns first available provider
- Faster booking (more slots available)

## 2.3 Admin Dashboard - Multi-Provider View

### 2.3.1 Dashboard Filtering

```
┌──────────────────────────────────────────────────────┐
│ TODAY'S APPOINTMENTS - February 20, 2026             │
│                                                       │
│ Provider: [All ▼] [Dr. Smith] [Dr. Lee]             │ ← NEW FILTER
│ Status: [All ▼]  Type: [All ▼]  Search: [🔍____]    │
│                                                       │
│ ┌──────────────────────────────────────────────────┐ │
│ │Time │Provider  │Patient     │Type       │Status │ │
│ ├──────────────────────────────────────────────────┤ │
│ │9:00 │Dr.Smith  │John Smith  │Mole Check │✅    │ │
│ │9:00 │Dr.Lee    │Sarah Lee   │Botox      │🟡    │ │ ← Same time!
│ │9:30 │Dr.Smith  │Bob Johnson │Acne       │✅    │ │
│ │10:00│(Available)│           │           │      │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 2.3.2 Provider Management UI

**Settings → Providers Tab**

```
┌────────────────────────────────────────────────────┐
│ PROVIDERS                                          │
│                                                     │
│ ┌──────────────────────────────────────────────┐  │
│ │ Dr. Sarah Smith, MD                          │  │
│ │ Medical Dermatology                          │  │
│ │ Status: ✅ Active, Accepting New Patients    │  │
│ │ Schedule: Mon-Fri 9am-5pm                    │  │
│ │ [Edit] [View Schedule] [Block Time]          │  │
│ └──────────────────────────────────────────────┘  │
│                                                     │
│ ┌──────────────────────────────────────────────┐  │
│ │ Dr. Michael Lee, MD                          │  │
│ │ Medical & Cosmetic                           │  │
│ │ Status: ✅ Active, Accepting New Patients    │  │
│ │ Schedule: Mon-Thu 10am-7pm                   │  │
│ │ [Edit] [View Schedule] [Block Time]          │  │
│ └──────────────────────────────────────────────┘  │
│                                                     │
│ [+ Add Provider]                                   │
└────────────────────────────────────────────────────┘
```

### 2.3.3 Provider Schedule Editor

```
┌────────────────────────────────────────────────────┐
│ Edit Schedule - Dr. Sarah Smith                    │
│                                                     │
│ Weekly Schedule                                     │
│ ┌──────────────────────────────────────────────┐  │
│ │ Monday    [✓] 09:00 AM - 05:00 PM            │  │
│ │ Tuesday   [✓] 09:00 AM - 05:00 PM            │  │
│ │ Wednesday [✓] 09:00 AM - 05:00 PM            │  │
│ │ Thursday  [✓] 09:00 AM - 05:00 PM            │  │
│ │ Friday    [✓] 09:00 AM - 03:00 PM            │  │
│ │ Saturday  [ ] Closed                         │  │
│ │ Sunday    [ ] Closed                         │  │
│ └──────────────────────────────────────────────┘  │
│                                                     │
│ Lunch Break (Optional)                             │
│ [✓] 12:00 PM - 01:00 PM                           │
│                                                     │
│ Buffer Between Appointments                         │
│ [5] minutes (time needed to prepare for next      │
│              patient)                              │
│                                                     │
│ Blocked Dates / Vacation                           │
│ 2026-03-15 to 2026-03-22 - Spring Break           │
│ [+ Add Blocked Period]                            │
│                                                     │
│ [Cancel]                              [Save]       │
└────────────────────────────────────────────────────┘
```

### 2.3.4 Treatment (Appointment Type) Management UI (NEW)

**Requirement:** When creating or editing a treatment, admins must be able to select which providers can perform it. This serves as the primary management point for provider-treatment mapping.

```
┌────────────────────────────────────────────────────┐
│ Edit Treatment - Botox                              │
│                                                     │
│ Name: [Botox Treatment]                             │
│ Duration: [45] minutes                              │
│ Category: ( ) Medical  (●) Cosmetic                 │
│ Deposit: [$50.00]                                   │
│                                                     │
│ Qualified Providers:                                │
│ [✓] Dr. Sarah Smith                                 │
│ [✓] Dr. Michael Lee                                 │
│ [ ] [Other Provider]                                │
│                                                     │
│ ℹ️  Only selected providers will be shown to        │
│     patients when booking this treatment.           │
│                                                     │
│ [Cancel]                              [Save Changes] │
└────────────────────────────────────────────────────┘
```

**Implementation Detail:**
Saving these changes must perform a bi-directional sync:
1. Update the `appointment_type` record (if applicable).
2. Update the `default_appointment_types` (JSONB) array for ALL providers in the clinic to ensure it accurately reflects whether they perform this treatment.

---

# 3. HIPAA-COMPLIANT EMAIL COMMUNICATIONS

## 3.1 The HIPAA Problem with Email

**Issue:** Email content containing **Patient Name + Appointment Type** = Protected Health Information (PHI)

**Example Violation:**
```
Subject: Reminder: Mole Check Appointment Tomorrow
Body: "Hi John Smith, your Mole Check appointment is tomorrow..."
```
This reveals that John Smith has a medical condition requiring mole examination.

## 3.2 Solution: Patient Consent + De-Identification Option

### 3.2.1 Database Schema - Patient Communication Consent

```sql
-- Add to patients table
ALTER TABLE patients ADD COLUMN communication_consent JSONB;

-- Example structure:
{
  "emailConsent": true,
  "emailPHI": false,  ← Can we include PHI in emails?
  "consentedAt": "2026-02-13T10:00:00Z",
  "consentIP": "192.168.1.1"
}
```

### 3.2.2 Booking Flow - Consent Checkbox

**Step 4: Contact Information (Updated)**

```
┌────────────────────────────────────────────────────┐
│  Your information                                   │
│                                                     │
│  [Contact fields...]                               │
│                                                     │
│  Communication Preferences                          │
│                                                     │
│  ☐ I consent to receive appointment reminders     │
  │     via email (REQUIRED for booking)             │
│                                                     │
│  Email Privacy Options:                            │
│  ⭕ Standard (includes appointment details)        │
│     Example: "Reminder: Your Mole Check           │
│     appointment is tomorrow"                       │
│                                                     │
│  ⭕ Private (de-identified, secure portal link)    │
│     Example: "You have an appointment tomorrow    │
│     at Dr. Smith's office. View details: [link]"  │
│                                                     │
│  ℹ️  We use secure, encrypted email. Your         │
│     information is protected according to HIPAA.   │
│                                                     │
│  ☑️ I acknowledge the Privacy Policy and agree to │
│     receive communications (REQUIRED)              │
│                                                     │
│  [Continue →]                                      │
└────────────────────────────────────────────────────┘
```

**Consent Policy:** Selection of at least one email option (Standard or Private) is MANDATORY. Online booking is not possible without this consent.

### 3.2.3 Email Templates (Updated for HIPAA)

**Option 1: Standard Email (Requires Consent for PHI)**

```html
Subject: Appointment Reminder - {{clinic_name}}

Hi {{patient_name}},

This is a reminder about your appointment:

Type: {{appointment_type}}
Date: {{date}} at {{time}}
Location: {{clinic_address}}

[View Full Details] [Add to Calendar] [Cancel]

---
You're receiving this because you consented to receive appointment 
details via email. To change your communication preferences, click here.
```

**Option 2: De-Identified Email (No PHI, Secure Link)**

```html
Subject: Appointment Reminder - {{clinic_name}}

Hi,

You have an upcoming appointment at {{clinic_name}}:

Date: {{date}} at {{time}}
Location: {{clinic_address}}

[View Secure Appointment Details]
(This link expires in 24 hours)

For questions, call us at {{clinic_phone}}

---
This email contains limited information for your privacy. Click the 
secure link above to view full appointment details.
```

### 3.2.4 Secure Appointment Detail Page (For De-Identified Option)

**URL:** `https://smartbook.app/secure/appointment/{{token}}`

- Token is cryptographically secure, single-use, 24-hour expiry
- Shows full appointment details after patient verifies email address
- Counts as additional security layer for HIPAA

```sql
CREATE TABLE secure_appointment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accessed_at TIMESTAMP WITH TIME ZONE,
  access_ip INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.2.5 API Requirement - Email Consent Validation

```javascript
// Before sending ANY email with PHI
async function canSendPHIEmail(patientId) {
  const patient = await getPatient(patientId);
  
  if (!patient.communication_consent?.emailConsent) {
    return false; // Patient never consented
  }
  
  if (!patient.communication_consent?.emailPHI) {
    return 'deidentified'; // Send de-identified email
  }
  
  return 'standard'; // Can send full details
}
```

---

# 4. PAYMENT & REFUND WORKFLOWS (COMPLETE SPECIFICATION)

## 4.1 All Cancellation Scenarios

### 4.1.1 Scenario Matrix

**Financial Policy:** Clinic absorbs all transaction processing fees. "Void hold" or "No action" means $0 cost. "Refund" means ~3% loss (avoided in 99% of cases).

| Cancelled By | Timing | Payment Status | Stripe Action | API Return |
|--------------|--------|----------------|---------------|------------|
| Patient | >24h before | Auth Hold or Pending | Void hold or Cancel job | `refunded: false, voided: true` |
| Patient | <24h before | Auth Hold | None (Hold remains) | `deposit_retained: true` |
| Patient | Never showed | Auth Hold | Capture hold | `charged: true` |
| Clinic | Any time | Auth Hold or Pending | Void hold or Cancel job | `voided: true` |
| System (auto-cancel) | Any time | ANY | Void hold or Cancel job | `voided: true` |

### 4.1.2 Clinic Cancellation - Explicit Requirements

**When admin cancels appointment:**

```javascript
// DELETE /api/admin/appointments/:id
async function cancelAppointmentByClinic(appointmentId, userId, reason) {
  const appointment = await getAppointment(appointmentId);
  
  // 1. Cancel Deposit (Void hold, cancel API job, or refund if already captured)
  // Uses the hybrid cancellation logic from Section 13.1
  const cancelResult = await cancelDeposit(appointmentId);
  
  if (!cancelResult.success) {
    throw new Error('Cannot cancel appointment - payment cancellation failed');
  }
  
  // 2. Update status
  await updateAppointmentStatus(appointmentId, 'cancelled_by_clinic', {
    cancelled_by_user_id: userId,
    cancellation_reason: reason,
    payment_action: cancelResult.action // 'voided', 'cancelled_scheduled', 'refunded', 'none'
  });
  
  // 3. Send apology email to patient
  await sendClinicCancellationEmail(appointment, reason, cancelResult);
  
  // 4. Release to waitlist
  await notifyWaitlist(appointment);
  
  return {appointment, paymentAction: cancelResult.action};
}
```

**Clinic Cancellation Email Template:**

```html
Subject: Appointment Cancellation - {{clinic_name}}

Dear {{patient_name}},

We sincerely apologize, but we need to cancel your appointment:

Original Appointment:
{{appointment_type}} on {{date}} at {{time}}

Reason: {{cancellation_reason}}

{{#if deposit_refunded}}
Your ${{deposit_amount}} deposit has been refunded to your card 
ending in {{last4}}. Please allow 3-5 business days for the refund 
to appear.
{{/if}}

We'd like to reschedule you at your convenience:
[View Available Times] or call us at {{clinic_phone}}

Again, we apologize for any inconvenience.

{{clinic_name}}
```

### 4.1.3 No-Show Deposit Charging - Explicit Workflow

**REQUIREMENT: Manual trigger only (admin discretion)**

**Why Manual?**
- Patient might have legitimate emergency
- Admin can verify patient actually didn't show (not just late)
- Legal liability reduction

**Workflow:**

```
1. Appointment time passes (e.g., 2:00 PM appointment)
2. Admin dashboard shows appointment as "Unconfirmed" or "Pending"
3. Admin waits 15-30 minutes (clinic policy)
4. If patient doesn't show:
   - Admin clicks [Mark as No-Show]
   - System shows confirmation dialog:
   
   ┌────────────────────────────────────────┐
   │ Confirm No-Show                        │
   ├────────────────────────────────────────┤
   │ Patient: Sarah Lee                     │
   │ Appointment: Botox Treatment           │
   │ Deposit: $50.00 authorized (hold)      │
   │                                        │
   │ ⚠️  Marking as no-show will:           │
   │  • Capture the $50 deposit hold        │
   │  • Send notification to patient        │
   │  • Update patient no-show count        │
   │                                        │
   │ Are you sure this patient did not      │
   │ attend the appointment?                │
   │                                        │
   │ [Cancel]           [Confirm No-Show]   │
   └────────────────────────────────────────┘
   
5. If confirmed:
   - System captures the authorization hold
   - Patient receives email notification
   - No-show count incremented
```

**API Specification:**

```
POST /api/admin/appointments/:id/no-show

Request:
{
  "chargeDeposit": true,  // Default from settings, can override
  "notes": "Patient did not show, no call"  // Optional
}

Response:
{
  "success": true,
  "data": {
    "appointment": {
      "status": "no_show",
      "noShowRecordedAt": "2026-02-20T14:30:00Z"
    },
    "deposit": {
      "charged": true,
      "amount": 50.00,
      "stripeChargeId": "ch_xxxxx",
      "status": "captured"
    },
    "patient": {
      "noShowCount": 1,
      "blocked": false
    }
  }
}
```

### 4.1.4 Failed Payment Handling (T-7 Capture)

**Scenario:** For appointments booked >7 days in advance, the system attempts to create an authorization hold 7 days before the appointment. This step can fail if the saved card is expired, cancelled, or has insufficient funds.

**Workflow on Failure:**
1. **System:** Marks payment status as `failed`.
2. **Alert:** Triggers "Payment Attention Required" alert in Admin Dashboard.
3. **Notification:** Sends automated email to patient ("Action Required: Update Payment Method").
4. **Deadline:** Starts a 48-hour countdown. If not resolved, system auto-cancels appointment.

### 4.1.5 Admin Dashboard - Failed Payment Alert

```
┌────────────────────────────────────────────────────┐
│ ⚠️  PAYMENT ATTENTION REQUIRED                     │
├────────────────────────────────────────────────────┤
│                                                     │
│ Card authorization failed for upcoming appointment: │
│                                                     │
│ Patient: Sarah Lee (sarah@example.com)             │
│ Appointment: Feb 26, 2:00 PM - Botox Treatment     │
│ Deposit: $50.00                                    │
│ Error: Card expired                                │
│                                                     │
│ Patient has been notified to update their card.    │
│ Auto-cancel in: 47h 23m (if not resolved)          │
│                                                     │
│ Actions:                                           │
│ [Send Payment Link] [Call Patient] [Waive Deposit] │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

# 5. WAITLIST PRIORITY & STAGGERED NOTIFICATIONS

## 5.1 The Problem with Simultaneous Blast

**Current design flaw:** If 5 people get notified at 10:00:00 AM simultaneously, priority is meaningless—only email-checking speed matters.

## 5.2 Solution: Priority Tiers with Staggered Timing

### 5.2.1 Priority Calculation (Detailed)

```javascript
function calculateWaitlistPriority(waitlistEntry, patient, clinic) {
  let priority = 0;
  let tier = 'standard';
  
  // TIER 1: Emergency/Urgent (Priority 100+)
  if (waitlistEntry.triage_data?.urgency_flag) {
    priority += 100;
    tier = 'urgent';
  }
  
  // TIER 2: High Priority (Priority 50-99)
  if (hasRecentNoShowHistory(patient) && isRebooking(patient, waitlistEntry)) {
    // Patient no-showed before, trying to rebook - lower priority
    priority -= 20;
  }
  
  const hasHistory = getCompletedAppointmentCount(patient, clinic.id) > 0;
  if (hasHistory) {
    priority += 50;
    tier = tier === 'urgent' ? 'urgent' : 'high';
  }
  
  // TIER 3: Standard Priority (Priority 0-49)
  const daysWaiting = Math.floor(
    (Date.now() - waitlistEntry.created_at) / (1000 * 60 * 60 * 24)
  );
  priority += Math.min(daysWaiting, 30); // Cap at 30 days
  
  // Specific date request (slight boost)
  if (waitlistEntry.preferred_datetime) {
    priority += 5;
  }
  
  return {priority, tier};
}
```

### 5.2.2 Staggered Notification Logic

```javascript
async function notifyWaitlistStaggered(appointmentId, clinicSettings) {
  // Get waitlist entries sorted by priority
  const waitlist = await getWaitlistEntries(appointmentId);
  
  // Group by tier
  const urgentTier = waitlist.filter(e => e.priority >= 100);
  const highTier = waitlist.filter(e => e.priority >= 50 && e.priority < 100);
  const standardTier = waitlist.filter(e => e.priority < 50);
  
  // Round 1: Urgent tier (immediate)
  if (urgentTier.length > 0) {
    await sendWaitlistNotifications(urgentTier.slice(0, 3), appointmentId);
    
    // Wait 15 minutes before Round 2
    await scheduleDelayedNotification({
      appointmentId: appointmentId,
      tier: 'high',
      delay: 15 * 60 * 1000 // 15 minutes
    });
    
    return {
      notified: urgentTier.slice(0, 3).length,
      tier: 'urgent',
      nextRound: '15 minutes'
    };
  }
  
  // Round 2: High tier (if no urgent, or after 15 min)
  if (highTier.length > 0) {
    await sendWaitlistNotifications(highTier.slice(0, 5), appointmentId);
    
    // Wait 30 minutes before Round 3
    await scheduleDelayedNotification({
      appointmentId: appointmentId,
      tier: 'standard',
      delay: 30 * 60 * 1000
    });
    
    return {
      notified: highTier.slice(0, 5).length,
      tier: 'high',
      nextRound: '30 minutes'
    };
  }
  
  // Round 3: Standard tier
  if (standardTier.length > 0) {
    await sendWaitlistNotifications(standardTier.slice(0, 5), appointmentId);
    
    return {
      notified: standardTier.slice(0, 5).length,
      tier: 'standard',
      nextRound: 'none'
    };
  }
}
```

### 5.2.3 Admin UI - Waitlist with Tiers

```
┌──────────────────────────────────────────────────────┐
│ WAITLIST - Mole Check Appointments                   │
│                                                       │
│ 🔴 URGENT (Will notify first)                        │
│ ┌────────────────────────────────────────────────┐   │
│ │ Jane Doe                                       │   │
│ │ Priority: 105 | Emergency flag | 5 days waiting│   │
│ │ [Select for notification]                      │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ 🟡 HIGH PRIORITY (Will notify if urgent doesn't      │
│                   claim within 15 min)               │
│ ┌────────────────────────────────────────────────┐   │
│ │ Bob Johnson                                    │   │
│ │ Priority: 55 | Existing patient | 3 days wait  │   │
│ │ [Select]                                       │   │
│ └────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────┐   │
│ │ Alice Smith                                    │   │
│ │ Priority: 52 | Existing patient | 2 days wait  │   │
│ │ [Select]                                       │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ⚪ STANDARD                                          │
│ [5 more patients...]                                 │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ Notification Strategy:                         │   │
│ │ ⭕ Automatic (Staggered by tier)               │   │
│ │ ⭕ Manual Selection                            │   │
│ │                                                │   │
│ │ [Notify Selected]  [Notify Automatically]      │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 5.2.4 Database Schema - Scheduled Notifications

```sql
CREATE TABLE scheduled_waitlist_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  tier VARCHAR(20) NOT NULL, -- 'urgent', 'high', 'standard'
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE, -- If slot claimed before execution
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for job processing
CREATE INDEX idx_scheduled_notifications_pending 
  ON scheduled_waitlist_notifications(scheduled_for) 
  WHERE executed_at IS NULL AND cancelled_at IS NULL;

-- Waitlist Cleanup Policy
-- To maintain performance, waitlist entries for a specific date should be marked as 'expired'
-- or archived once the appointment date has passed.
-- Recommended: A nightly job to update waitlist entries where preferred_date < CURRENT_DATE to status 'expired'.
```

---

# 6. INSURANCE VERIFICATION WORKFLOW

## 6.1 The Missing Workflow

**Problem:** System collects insurance info, but no way to track verification status or mark as ready for appointment.

## 6.2 Solution: Insurance Verification Status Tracking

### 6.2.1 Updated appointments.insurance_info Structure

```sql
-- insurance_info JSONB structure
{
  "provider": "Blue Cross Blue Shield",
  "policyId": "ABC123456",
  "groupNumber": "12345",
  "cardholderName": "John Smith",
  "cardholderDob": "1985-03-15",
  
  -- NEW FIELDS
  "verificationStatus": "pending",  // "pending", "verified", "failed", "not_required"
  "verifiedBy": "user-uuid-123",    // Admin user who verified
  "verifiedAt": "2026-02-13T10:00:00Z",
  "verificationNotes": "Active policy, $30 copay",
  "eligibilityCheckedAt": "2026-02-13T10:00:00Z",
  "copayAmount": 30.00,
  "requiresPriorAuth": false
}
```

### 6.2.2 API Endpoint - Mark Insurance as Verified

**PATCH /api/admin/appointments/:id/insurance**

Update insurance verification status.

**Request:**
```json
PATCH /api/admin/appointments/appt-uuid-123/insurance

Headers:
Authorization: Bearer {accessToken}

{
  "verificationStatus": "verified",  // or "failed"
  "verificationNotes": "Policy active, $30 copay, no prior auth needed",
  "copayAmount": 30.00,
  "requiresPriorAuth": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "appointment": {
      "id": "appt-uuid-123",
      "insuranceInfo": {
        "provider": "Blue Cross",
        "policyId": "ABC123456",
        "verificationStatus": "verified",
        "verifiedBy": "Admin User",
        "verifiedAt": "2026-02-13T10:30:00Z",
        "copayAmount": 30.00
      }
    }
  }
}
```

**Automated Notification on "Failed" Status:**

When an admin marks insurance as `failed`, the system MUST automatically trigger a notification to the patient:

```javascript
// Called when PATCH /api/admin/appointments/:id/insurance sets status to 'failed'
async function onInsuranceVerificationFailed(appointment, clinic) {
  const patient = await getPatient(appointment.patient_id);
  
  // Generate secure link for patient to update their insurance info
  const updateToken = await generateSecureToken(appointment.id, '48h');
  const updateLink = `${clinic.baseUrl}/secure/update-insurance/${updateToken}`;
  
  // Send notification (respects HIPAA consent level)
  const emailType = await canSendPHIEmail(patient.id);
  
  if (emailType === 'standard') {
    await sendEmail(patient.email, 'insurance_failed_standard', {
      patientName: patient.full_name,
      appointmentDate: formatDate(appointment.scheduled_datetime, clinic.timezone),
      clinicName: clinic.name,
      clinicPhone: clinic.phone,
      updateLink: updateLink
    });
  } else {
    // De-identified version
    await sendEmail(patient.email, 'insurance_failed_deidentified', {
      clinicName: clinic.name,
      clinicPhone: clinic.phone,
      updateLink: updateLink
    });
  }
}
```

**Insurance Failed Email Template (Standard):**
```
Subject: Action Required: Insurance Update Needed - {{clinic_name}}

Hi {{patient_name}},

We were unable to verify the insurance information for your upcoming appointment
on {{appointment_date}}.

Please update your insurance details using the secure link below:
[Update Insurance Information]({{update_link}})
(This link expires in 48 hours)

Alternatively, call us at {{clinic_phone}} to provide updated information.

{{clinic_name}}
```

### 6.2.3 Admin Dashboard - Insurance Verification Queue

**New Tab: "Insurance Queue"**

```
┌──────────────────────────────────────────────────────┐
│ INSURANCE VERIFICATION QUEUE                         │
│                                                       │
│ Filter: [Pending ▼] [All] [Verified] [Failed]       │
│                                                       │
│ ⚠️  3 appointments need verification                 │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ Tomorrow, 9:00 AM - John Smith                 │   │
│ │ Type: Mole Check                               │   │
│ │ Insurance: Blue Cross Blue Shield              │   │
│ │ Policy: ABC123456 | Group: 12345               │   │
│ │                                                │   │
│ │ Status: 🟡 Pending Verification                │   │
│ │                                                │   │
│ │ [Mark as Verified] [Mark as Failed] [View]     │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ Feb 22, 2:00 PM - Sarah Lee                    │   │
│ │ Type: Acne Treatment                           │   │
│ │ Insurance: Aetna                               │   │
│ │ Policy: XYZ789012                              │   │
│ │                                                │   │
│ │ Status: 🟡 Pending Verification                │   │
│ │                                                │   │
│ │ [Mark as Verified] [Mark as Failed] [View]     │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 6.2.4 Verification Modal

```
┌──────────────────────────────────────────────────────┐
│ Verify Insurance - John Smith                   [X] │
├──────────────────────────────────────────────────────┤
│                                                       │
│ Patient: John Smith                                  │
│ Appointment: Tomorrow, Feb 21 at 9:00 AM             │
│ Type: Mole Check (30 min)                            │
│                                                       │
│ Insurance Information                                 │
│ Provider: Blue Cross Blue Shield                     │
│ Policy ID: ABC123456                                 │
│ Group Number: 12345                                  │
│ Cardholder: John Smith                               │
│ DOB: 03/15/1985                                      │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ Call insurance: 1-800-XXX-XXXX                 │   │
│ │ Reference: Policy ABC123456                    │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ Verification Result                                   │
│ ⭕ Verified - Policy Active                          │
│ ⭕ Failed - Policy Inactive/Invalid                  │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ Copay Amount: $[30.00]                         │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ Prior Authorization Required?                  │   │
│ │ ⭕ No  ⭕ Yes                                    │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ┌────────────────────────────────────────────────┐   │
│ │ Verification Notes                             │   │
│ │ [___________________________________]           │   │
│ │ [___________________________________]           │   │
│ │ (e.g., "Policy active, dermatology covered")   │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ [Cancel]                              [Save]          │
└──────────────────────────────────────────────────────┘
```

### 6.2.5 Dashboard Alert - Unverified Appointments

**Today's Schedule - Warning Banner:**

```
┌──────────────────────────────────────────────────────┐
│ ⚠️  WARNING: 2 appointments today have unverified    │
│    insurance. Patients may be turned away at check-in│
│                                                       │
│    [View Insurance Queue]                            │
└──────────────────────────────────────────────────────┘
```

  [Cancel]                              [Save]          │
└──────────────────────────────────────────────────────┘

### 6.2.6 Automated Reminder & Real-Time Urgency
**Note:** For same-day/next-day bookings, see Section 13.6 for "Real-Time Urgency" logic which triggers immediate alerts instead of this daily job.

**Scheduler Job: T-24h Check (Standard Priority Only)**

```javascript
async function checkInsuranceVerification() {
  // Find medical appointments tomorrow that aren't verified
  const tomorrow = addDays(new Date(), 1);
  
  const unverified = await db.query(`
    SELECT a.*, p.full_name, p.email 
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN appointment_types at ON a.appointment_type_id = at.id
    WHERE at.category = 'medical'
    AND DATE(a.scheduled_datetime) = $1
    AND (a.insurance_info->>'verificationStatus') = 'pending'
    AND a.status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')
  `, [tomorrow]);
  
  if (unverified.length > 0) {
    // Send alert to admin
    await sendAdminAlert({
      type: 'unverified_insurance_tomorrow',
      count: unverified.length,
      appointments: unverified.map(a => ({
        patient: a.full_name,
        time: a.scheduled_datetime
      }))
    });
  }
}
```

**Admin Email Alert:**
```
Subject: ⚠️ Action Required: Unverified Insurance for Tomorrow

2 appointments tomorrow have unverified insurance:

1. John Smith - 9:00 AM - Mole Check
   Insurance: Blue Cross (ABC123456)

2. Sarah Lee - 2:00 PM - Acne Treatment
   Insurance: Aetna (XYZ789012)

Please verify insurance before these appointments:
[View Insurance Queue]

SmartBook Admin
```

---

# 7. PATIENT MATCHING LOGIC (DUPLICATE PREVENTION)

## 7.1 The Problem

**Scenario:** John Smith books appointment on Feb 10. John Smith books again on Feb 20. System could create two patient records.

**Result:** Duplicate records, fragmented history, incorrect "new patient" status.

## 7.2 Solution: Intelligent Patient Matching

### 7.2.1 Matching Algorithm

```javascript
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[^\w\s]/g, '') // remove special chars
    .replace(/\s+/g, ' ')    // collapse whitespace
    .replace(/\b(dr|mr|mrs|ms|jr|sr|ii|iii)\b/g, '') // remove titles/suffixes
    .trim();
}

async function findOrCreatePatient(bookingData, clinicId) {
  const { fullName, email, phone, dateOfBirth } = bookingData.patient;
  const normalizedName = normalizeString(fullName);
  
  // UNIFIED LOGIC: DOB is now in MVP scope (v2.1 Unified)
  
  // Step 1: Primary Match (Email + DOB) — most reliable for shared-email families
  if (dateOfBirth) {
    const dobMatch = await db.query(
      `SELECT * FROM patients 
       WHERE clinic_id = $1 
       AND LOWER(email) = LOWER($2)
       AND date_of_birth = $3`,
      [clinicId, email, dateOfBirth]
    );
    if (dobMatch.rows[0]) {
      // Update name/phone if changed
      await db.query(
        `UPDATE patients SET full_name = COALESCE(NULLIF($1, ''), full_name), 
         phone = COALESCE(NULLIF($2, ''), phone), updated_at = NOW() WHERE id = $3`,
        [fullName, normalizePhone(phone), dobMatch.rows[0].id]
      );
      return dobMatch.rows[0];
    }
  }
  
  // Step 2: Fallback Match (Email + Normalized Name) — for patients without DOB yet
  let patient = await db.query(
    `SELECT * FROM patients 
     WHERE clinic_id = $1 
     AND LOWER(email) = LOWER($2)
     AND normalize_string(full_name) = $3`,
    [clinicId, email, normalizedName]
  );
  
  if (patient.rows[0]) {
    // Exact match - update phone if changed
    if (normalizePhone(patient.rows[0].phone) !== normalizePhone(phone)) {
      await db.query(
        `UPDATE patients SET phone = $1, updated_at = NOW() WHERE id = $2`,
        [normalizePhone(phone), patient.rows[0].id]
      );
    }
    return patient.rows[0];
  }
  
  // Step 3: Shared Email Detection
  // Email matches but Name AND DOB are different -> Create new record flagged as shared
  const emailMatch = await db.query(
    `SELECT * FROM patients WHERE clinic_id = $1 AND LOWER(email) = LOWER($2)`,
    [clinicId, email]
  );
  
  if (emailMatch.rows.length > 0) {
    // Create new patient with shared email flag
    return await createPatient(clinicId, fullName, email, phone, dateOfBirth, true);
  }
  
  // Step 4: Phone + Name Fuzzy Match (Same person, changed email)
  const phoneMatch = await db.query(
    `SELECT *, similarity(normalize_string(full_name), $1) AS name_sim 
     FROM patients
     WHERE clinic_id = $2 AND phone = $3
     AND similarity(normalize_string(full_name), $1) > 0.85`,
    [normalizedName, clinicId, normalizePhone(phone)]
  );
  
  if (phoneMatch.rows[0]) {
    // Update email and DOB if available
    await db.query(
      `UPDATE patients SET email = $1, date_of_birth = COALESCE($3, date_of_birth) WHERE id = $2`,
      [email, phoneMatch.rows[0].id, dateOfBirth]
    );
    return phoneMatch.rows[0];
  }
  
  // Step 5: No match - Create new patient
  return await createPatient(clinicId, fullName, email, phone, dateOfBirth, false);
}

async function createPatient(clinicId, fullName, email, phone, dateOfBirth, isShared) {
  const res = await db.query(
    `INSERT INTO patients 
     (clinic_id, full_name, email, phone, date_of_birth, is_shared_email_account, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [clinicId, fullName, email, normalizePhone(phone), dateOfBirth, isShared]
  );
  return res.rows[0];
}
```

### 7.2.2 Patient Merge Tool (Admin)

**For cases where duplicates were created:**

```
┌──────────────────────────────────────────────────────┐
│ Merge Duplicate Patients                             │
├──────────────────────────────────────────────────────┤
│                                                       │
│ Potential duplicate detected:                         │
│                                                       │
│ ┌─────────────────────┐   ┌─────────────────────┐   │
│ │ Patient A           │   │ Patient B           │   │
│ │                     │   │                     │   │
│ │ Name: John Smith    │   │ Name: John Smith    │   │
│ │ Email: john@ex.com  │   │ Email: j.smith@...  │   │
│ │ Phone: 555-123-4567 │   │ Phone: 555-123-4567 │   │
│ │ Appointments: 2     │   │ Appointments: 1     │   │
│ │ Created: Feb 10     │   │ Created: Feb 20     │   │
│ └─────────────────────┘   └─────────────────────┘   │
│                                                       │
│ These appear to be the same person.                  │
│                                                       │
│ Primary Record: ⭕ Patient A  ⭕ Patient B            │
│                                                       │
│ [Cancel]                    [Merge Patients]          │
└──────────────────────────────────────────────────────┘
```

**Merge Logic:**
```javascript
async function mergePatients(primaryId, duplicateId) {
  // 1. Move all appointments to primary record
  await db.query(
    `UPDATE appointments SET patient_id = $1 WHERE patient_id = $2`,
    [primaryId, duplicateId]
  );
  
  // 2. Move waitlist entries
  await db.query(
    `UPDATE waitlist SET patient_id = $1 WHERE patient_id = $2`,
    [primaryId, duplicateId]
  );
  
  // 3. Merge contact info (keep most recent/complete)
  // 4. Delete duplicate record
  await db.query(`DELETE FROM patients WHERE id = $1`, [duplicateId]);
  
  // 5. Log merge in audit log
  await logAudit({action: 'merge_patients', primaryId, duplicateId});
}
```

---

# 8. EXPLICIT TIMEZONE HANDLING

## 8.1 Requirements

### 8.1.1 Clinics Table - Timezone Column (REQUIRED)

```sql
-- clinics table MUST have timezone
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  
  -- CRITICAL: Timezone for all datetime displays
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  -- Valid values: IANA timezone database names
  -- Examples: 'America/New_York', 'America/Chicago', 'America/Los_Angeles'
  
  -- Constraint: Must be valid timezone
  CHECK (timezone IN (
    'America/New_York', 'America/Chicago', 'America/Denver', 
    'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
    'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver'
    -- Add all US/Canada timezones
  )),
  
  -- Rest of columns...
);
```

### 8.1.2 All Datetime Storage: UTC + Timezone Conversion

**Rule:** 
- **Store:** Always UTC in database
- **Display:** Always convert to clinic's timezone
- **Input:** Convert from clinic's timezone to UTC

```javascript
// When saving appointment
const luxon = require('luxon');

function saveAppointment(clinicTimezone, selectedDate, selectedTime) {
  // Patient selected "Feb 20, 2026 at 2:00 PM" in clinic's local time
  const localDateTime = luxon.DateTime.fromObject(
    {
      year: 2026,
      month: 2,
      day: 20,
      hour: 14,
      minute: 0
    },
    { zone: clinicTimezone }
  );
  
  // Convert to UTC for storage
  const utcDateTime = localDateTime.toUTC();
  
  // Save to database
  await db.query(
    `INSERT INTO appointments (scheduled_datetime) VALUES ($1)`,
    [utcDateTime.toJSDate()]
  );
}

// When displaying appointment
function displayAppointment(appointment, clinicTimezone) {
  const utcDateTime = luxon.DateTime.fromJSDate(
    appointment.scheduled_datetime,
    { zone: 'utc' }
  );
  
  // Convert to clinic's timezone
  const localDateTime = utcDateTime.setZone(clinicTimezone);
  
  return {
    date: localDateTime.toFormat('EEEE, MMMM d, yyyy'),
    time: localDateTime.toFormat('h:mm a ZZZZ'),
    // "2:00 PM EST"
  };
}
```

### 8.1.3 Daylight Saving Time Handling

**Scenario:** Appointment scheduled for March 10, 2026 at 2:30 AM EST (DST transition)

**Problem:** 2:30 AM doesn't exist on March 10 (clocks spring forward from 2:00 AM to 3:00 AM)

**Solution:** Luxon handles this automatically

```javascript
// Luxon automatically adjusts invalid times
const invalidTime = luxon.DateTime.fromObject(
  {year: 2026, month: 3, day: 10, hour: 2, minute: 30},
  {zone: 'America/New_York'}
);

console.log(invalidTime.toISO());
// Output: "2026-03-10T03:30:00-04:00"
// Luxon moved it to 3:30 AM EDT (after DST)
```

**Booking UI Prevention:**

```javascript
// When generating available slots, skip invalid times
function generateSlots(date, timezone) {
  const slots = [];
  
  for (let hour = 9; hour < 17; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const slot = luxon.DateTime.fromObject(
        {year: date.year, month: date.month, day: date.day, hour, minute},
        {zone: timezone}
      );
      
      // Check if slot is valid (not during DST transition)
      if (slot.isValid) {
        slots.push(slot);
      }
    }
  }
  
  return slots;
}
```

---

# 9. REVISED DATABASE SCHEMA (COMPLETE)

## 9.1 All Tables Summary

| Table | Purpose | New/Updated |
|-------|---------|-------------|
| clinics | Clinic information with timezone | Updated |
| providers | Provider management | **NEW** |
| provider_schedules | Provider-specific schedules | **NEW** |
| provider_blocked_times | Provider vacations/time off | **NEW** |
| users | Admin authentication | Existing |
| patients | Patient records with consent | Updated |
| appointment_types | Service types | Existing |
| appointments | Bookings with provider_id | Updated |
| waitlist | Priority-based queue | Updated |
| scheduled_waitlist_notifications | Staggered notifications | **NEW** |
| clinic_settings | Configuration | Existing |
| communication_log | Email tracking | Existing |
| email_templates | Customizable templates | Existing |
| audit_log | HIPAA compliance | Existing |
| claim_tokens | Waitlist claim security | Existing |
| secure_appointment_tokens | De-identified email links | **NEW** |

## 9.2 Key Schema Changes

**1. clinics: Added timezone (REQUIRED)**
**2. providers: New table for multi-provider**
**3. provider_schedules: Provider-specific availability**
**4. provider_blocked_times: Time-off management**
**5. appointments: Added provider_id, updated insurance_info structure, status enum**
**6. patients: Added communication_consent, is_shared_email_account (v2.1)**
**7. waitlist: Updated priority calculation fields**
**8. scheduled_waitlist_notifications: Staggered timing**
**9. secure_appointment_tokens: HIPAA-compliant email links**

---

# 10. REVISED API ENDPOINTS (COMPLETE)

## 10.1 New/Updated Endpoints

### Multi-Provider Endpoints
- GET /api/public/clinics/:slug/providers
- POST /api/public/triage (now includes providerId)
- GET /api/admin/providers
- POST /api/admin/providers
- PUT /api/admin/providers/:id
- DELETE /api/admin/providers/:id
- GET /api/admin/providers/:id/schedule
- PUT /api/admin/providers/:id/schedule
- POST /api/admin/providers/:id/block-time

### Treatment (Appointment Type) Endpoints (Updated)
- GET /api/admin/appointment-types
- POST /api/admin/appointment-types (now accepts providerIds array)
- PUT /api/admin/appointment-types/:id (now accepts providerIds array)
- DELETE /api/admin/appointment-types/:id

### Insurance Verification Endpoints
- **PATCH /api/admin/appointments/:id/insurance** (NEW)
- GET /api/admin/insurance-queue (NEW)

### Waitlist Endpoints (Updated)
- POST /api/admin/waitlist/notify-staggered (NEW - replaces simple notify)
- GET /api/admin/waitlist/priority-breakdown (NEW)

### HIPAA Compliance Endpoints
- GET /api/secure/appointment/:token (NEW - for de-identified emails)
- POST /api/admin/communication/send-deidentified (NEW)

---

# 11. TESTING REQUIREMENTS (UPDATED)

## 11.1 Critical Test Scenarios

### Multi-Provider Testing
- [ ] Two providers have same time slot → both bookable
- [ ] Provider-specific appointment types work correctly
- [ ] Provider vacation blocks slots correctly
- [ ] "Any available" provider selection works
- [ ] Admin can filter by provider in dashboard

### HIPAA Compliance Testing
- [ ] Consent checkbox appears in booking flow
- [ ] Patient can choose standard vs de-identified emails
- [ ] De-identified emails don't contain appointment type
- [ ] Secure token links work and expire correctly
- [ ] Emails without consent are blocked

### Payment/Refund Testing
- [ ] Clinic cancellation triggers automatic refund
- [ ] Refund email sent to patient
- [ ] No-show marking requires manual confirmation
- [ ] Failed deposit charges create admin alerts
- [ ] All deposit statuses track correctly

### Waitlist Priority Testing
- [ ] Priority calculation works correctly
- [ ] Tier-based grouping works (urgent/high/standard)
- [ ] Staggered notifications send at correct times
- [ ] Higher priority patients notified first
- [ ] Notification cancels if slot claimed early

### Insurance Verification Testing
- [ ] Insurance queue shows unverified appointments
- [ ] Admin can mark as verified/failed
- [ ] Verification notes save correctly
- [ ] Dashboard warns about unverified appointments
- [ ] T-24h reminder sent for unverified insurance

### Patient Matching Testing
- [ ] Same email creates single patient record
- [ ] Same phone + similar name merges correctly
- [ ] Different people with same phone stay separate
- [ ] Patient info updates on return visit
- [ ] Duplicate merge tool works correctly

### Timezone Testing
- [ ] Appointments display in correct timezone
- [ ] DST transition dates handled correctly
- [ ] Multi-timezone booking works (patient in different zone)
- [ ] Confirmation emails show correct timezone
- [ ] Reminder timing respects timezone

---

# 12. IMPLEMENTATION PRIORITIES (REVISED)

## 12.1 Week-by-Week Updated Plan

### Week 1: Foundation + Multi-Provider + Payments
- Days 1-2: Database schema setup
- Day 3: Stripe Payment Gateway Setup (Critical for "Immediate Capture")
- Days 4-5: Multi-provider models and API endpoints

### Week 2: Booking Flow + HIPAA
- Days 6-7: Patient booking with provider selection
- Days 8-9: HIPAA consent UI and email templates
- Day 10: Secure appointment token system

### Week 3: Admin Dashboard + Insurance
- Days 11-12: Admin UI with provider filtering
- Days 13-14: Insurance verification queue and workflow
- Day 15: Provider management UI

### Week 4: Waitlist + Payments + Testing
- Days 16-17: Priority-based waitlist with staggering
- Days 18-19: Complete payment/refund workflows
- Days 20-21: Patient matching logic
- Days 22-24: End-to-end testing and deployment

---

# 13. CRITICAL ISSUE RESOLUTIONS (v2.1 AMENDMENTS)

## 13.1 Deposit Payment Strategy — Hybrid Payment Model

### The Problem
The previous "Immediate Capture with Refund" model charged the deposit at booking and issued Stripe refunds on cancellation. **Problem:** Stripe charges ~2.9% + 30¢ per transaction and **does not return this fee on refund**. For a $50 deposit, each refund costs the clinic ~$1.75 in unrecoverable fees. At scale, this becomes a significant revenue leak.

### Decision: Hybrid Payment Model (Auth Hold + Delayed Capture)

**Rationale:** By using authorization holds (which can be voided at $0 cost) and delaying charges for far-future bookings, the clinic avoids refund fees in the vast majority of cancellation scenarios. Actual refunds only occur in rare edge cases where cancellation happens after capture.

**Payment Strategy Selection:**

```
At Booking Time:
  IF appointment is ≤ 7 days away:
    → Authorization Hold (capture_method: 'manual')
    → Card authorized for $50, NOT charged yet
    → Cancel = void hold at $0 cost

  IF appointment is > 7 days away:
    → SetupIntent (save payment method only)
    → Card validated and saved, NOT charged yet
    → Scheduled job creates auth hold at T-7 days
    → Cancel before T-7 = $0 cost (nothing was charged)
    → Cancel after T-7 = void hold at $0 cost
```

**Complete Payment Lifecycle:**

```
┌──────────────────────────────────────────────────────────────────┐
│                    HYBRID PAYMENT FLOW                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BOOKING (≤ 7 days out)          BOOKING (> 7 days out)         │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │ Auth Hold $50       │         │ SetupIntent          │        │
│  │ (card authorized,   │         │ (card saved,         │        │
│  │  not charged)       │         │  not charged)        │        │
│  └────────┬────────────┘         └────────┬────────────┘        │
│           │                               │                      │
│           │                      At T-7 days before appt:       │
│           │                      ┌─────────────────────┐        │
│           │                      │ Auth Hold $50       │        │
│           │                      │ (auto-created by    │        │
│           │                      │  scheduled job)     │        │
│           │                      └────────┬────────────┘        │
│           │                               │                      │
│           ├───────────────────────────────┤                      │
│           │      BOTH PATHS MERGE         │                      │
│           ▼                               ▼                      │
│  ┌──────────────────────────────────────────────────┐           │
│  │ On Attended Appointment:                          │           │
│  │   → Admin marks "Completed"                       │           │
│  │   → paymentIntent.capture() — charges $50         │           │
│  │   → Deposit applied toward treatment              │           │
│  ├──────────────────────────────────────────────────┤           │
│  │ On Timely Cancellation (> deadline):              │           │
│  │   → paymentIntent.cancel() — void hold at $0     │           │
│  │   → Patient email: "Hold released, no charge"    │           │
│  ├──────────────────────────────────────────────────┤           │
│  │ On Late Cancellation (< deadline):                │           │
│  │   → paymentIntent.capture() — charges $50        │           │
│  │   → Deposit retained by clinic                    │           │
│  ├──────────────────────────────────────────────────┤           │
│  │ On No-Show:                                       │           │
│  │   → paymentIntent.capture() — charges $50        │           │
│  │   → Admin marks no-show for records               │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
│  EDGE CASES (> 7 days, cancel before T-7):                      │
│  ┌──────────────────────────────────────────────────┐           │
│  │ → No hold exists yet, nothing to void             │           │
│  │ → Cancel scheduled capture job                    │           │
│  │ → $0 cost                                         │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
│  RARE FALLBACK (card fails at T-7):                             │
│  ┌──────────────────────────────────────────────────┐           │
│  │ → Scheduled capture fails                         │           │
│  │ → Admin alert: "Card failed for upcoming appt"   │           │
│  │ → Patient notified to update payment method       │           │
│  │ → 48h deadline, else appointment auto-cancelled  │           │
│  └──────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**Updated Database Schema:**

```sql
-- Updated payment_info JSONB structure in appointments table
{
  "paymentStrategy": "auth_hold",         -- "auth_hold" (≤7d) or "delayed_capture" (>7d)
  "stripePaymentIntentId": "pi_xxxxx",    -- Populated on auth hold creation
  "stripeSetupIntentId": "seti_xxxxx",    -- Populated for >7d bookings (null for ≤7d)
  "stripePaymentMethodId": "pm_xxxxx",    -- Saved payment method
  "depositAmount": 50.00,
  "depositStatus": "authorized",          -- "pending_setup" | "authorized" | "captured" | "voided" | "failed"
  "authorizedAt": "2026-02-13T10:00:00Z", -- When auth hold was placed
  "capturedAt": null,                     -- Populated when deposit is captured
  "voidedAt": null,                       -- Populated if hold was voided on cancellation
  "scheduledCaptureAt": "2026-02-20T10:00:00Z", -- When T-7 job should create auth hold (>7d only)
  "refundId": null,                       -- Only populated in rare post-capture refund
  "refundedAt": null,
  "refundedAmount": null,
  "refundReason": null                    -- "timely_cancellation", "clinic_cancellation" (rare fallback)
}
```

**Updated Stripe Integration:**

```javascript
// services/paymentService.js

const DAYS_THRESHOLD = 7; // Auth holds expire after 7 days

// ─── MAIN ENTRY POINT ───────────────────────────────────────────
// Called at booking time — routes to auth hold or SetupIntent
async function processDepositAtBooking(paymentMethodId, amount, appointmentId, patientEmail, appointmentDatetime) {
  const daysUntilAppointment = Math.ceil(
    (new Date(appointmentDatetime) - new Date()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilAppointment <= DAYS_THRESHOLD) {
    // ≤ 7 days: Place auth hold immediately
    return await createAuthHold(paymentMethodId, amount, appointmentId, patientEmail);
  } else {
    // > 7 days: Save card, schedule capture at T-7
    return await savePaymentMethodForLater(paymentMethodId, amount, appointmentId, patientEmail, appointmentDatetime);
  }
}

// ─── PATH A: AUTH HOLD (≤ 7 days) ────────────────────────────────
async function createAuthHold(paymentMethodId, amount, appointmentId, patientEmail) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),       // cents
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      capture_method: 'manual',               // Auth hold — NOT captured yet
      description: `Deposit hold for appointment ${appointmentId}`,
      receipt_email: patientEmail,
      metadata: {
        appointment_id: appointmentId,
        type: 'cosmetic_deposit'
      }
    });

    return {
      success: true,
      paymentStrategy: 'auth_hold',
      paymentIntentId: paymentIntent.id,
      status: 'authorized',
      amount: amount
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      stripeError: error.raw?.message
    };
  }
}

// ─── PATH B: SETUP INTENT (> 7 days) ─────────────────────────────
async function savePaymentMethodForLater(paymentMethodId, amount, appointmentId, patientEmail, appointmentDatetime) {
  try {
    // Attach payment method to a customer (create or retrieve)
    const customer = await getOrCreateStripeCustomer(patientEmail);
    
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id
    });

    // Create SetupIntent to validate the card
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method: paymentMethodId,
      confirm: true,
      usage: 'off_session',
      metadata: {
        appointment_id: appointmentId,
        type: 'cosmetic_deposit'
      }
    });

    // Schedule auth hold creation at T-7 days
    const scheduledCaptureAt = new Date(appointmentDatetime);
    scheduledCaptureAt.setDate(scheduledCaptureAt.getDate() - DAYS_THRESHOLD);

    await scheduleDelayedCapture({
      appointmentId,
      paymentMethodId,
      customerId: customer.id,
      amount,
      patientEmail,
      scheduledFor: scheduledCaptureAt
    });

    return {
      success: true,
      paymentStrategy: 'delayed_capture',
      setupIntentId: setupIntent.id,
      paymentMethodId: paymentMethodId,
      status: 'pending_setup',
      scheduledCaptureAt: scheduledCaptureAt.toISOString(),
      amount: amount
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      stripeError: error.raw?.message
    };
  }
}

// ─── SCHEDULED JOB: T-7 CAPTURE ──────────────────────────────────
// Runs hourly — finds appointments at T-7 and creates auth holds
async function processScheduledCaptures() {
  const now = new Date();
  
  const pendingCaptures = await db.query(`
    SELECT a.id, a.patient_id, a.payment_info, a.scheduled_datetime,
           p.email as patient_email
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    WHERE a.payment_info->>'paymentStrategy' = 'delayed_capture'
      AND a.payment_info->>'depositStatus' = 'pending_setup'
      AND (a.payment_info->>'scheduledCaptureAt')::timestamptz <= $1
      AND a.status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')
  `, [now]);

  for (const appointment of pendingCaptures.rows) {
    const paymentInfo = appointment.payment_info;

    try {
      const holdResult = await createAuthHold(
        paymentInfo.stripePaymentMethodId,
        paymentInfo.depositAmount,
        appointment.id,
        appointment.patient_email
      );

      if (holdResult.success) {
        // Update appointment with new auth hold details
        await updatePaymentInfo(appointment.id, {
          ...paymentInfo,
          stripePaymentIntentId: holdResult.paymentIntentId,
          depositStatus: 'authorized',
          authorizedAt: new Date().toISOString()
        });
      } else {
        // Card failed — mark as failed, alert admin, notify patient
        await handleFailedScheduledCapture(appointment, holdResult.error);
      }

    } catch (error) {
      await handleFailedScheduledCapture(appointment, error.message);
    }
  }
}

// ─── CANCELLATION: VOID HOLD OR NO-OP ────────────────────────────
async function cancelDeposit(appointmentId) {
  const appointment = await getAppointment(appointmentId);
  const paymentInfo = appointment.payment_info;
  
  if (!paymentInfo) return { success: true, action: 'none' };

  const status = paymentInfo.depositStatus;

  // Case 1: Auth hold exists — void it at $0 cost
  if (status === 'authorized' && paymentInfo.stripePaymentIntentId) {
    await stripe.paymentIntents.cancel(paymentInfo.stripePaymentIntentId);
    await updatePaymentInfo(appointmentId, {
      ...paymentInfo,
      depositStatus: 'voided',
      voidedAt: new Date().toISOString()
    });
    return { success: true, action: 'voided', cost: 0 };
  }

  // Case 2: Card saved but T-7 not yet reached — cancel scheduled job
  if (status === 'pending_setup') {
    await cancelScheduledCapture(appointmentId);
    await updatePaymentInfo(appointmentId, {
      ...paymentInfo,
      depositStatus: 'voided',
      voidedAt: new Date().toISOString()
    });
    return { success: true, action: 'cancelled_scheduled', cost: 0 };
  }

  // Case 3: Already captured (rare — late cancel after capture) — issue refund
  if (status === 'captured' && paymentInfo.stripePaymentIntentId) {
    return await refundDeposit(paymentInfo.stripePaymentIntentId, paymentInfo.depositAmount, 'cancellation');
  }

  return { success: true, action: 'none' };
}

// ─── CAPTURE: ON APPOINTMENT COMPLETION OR NO-SHOW ────────────────
async function captureDeposit(appointmentId) {
  const appointment = await getAppointment(appointmentId);
  const paymentInfo = appointment.payment_info;

  if (paymentInfo?.depositStatus !== 'authorized') {
    throw new Error('No authorized hold to capture');
  }

  const captured = await stripe.paymentIntents.capture(
    paymentInfo.stripePaymentIntentId
  );

  await updatePaymentInfo(appointmentId, {
    ...paymentInfo,
    depositStatus: 'captured',
    capturedAt: new Date().toISOString()
  });

  return { success: true, chargeId: captured.latest_charge, amount: paymentInfo.depositAmount };
}

// ─── REFUND (RARE FALLBACK) ───────────────────────────────────────
// Only called when cancellation happens after deposit was already captured
async function refundDeposit(stripePaymentIntentId, amount, reason) {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: stripePaymentIntentId,
      amount: Math.round(amount * 100),
      reason: 'requested_by_customer',
      metadata: { reason: reason }
    });

    return {
      success: true,
      action: 'refunded',
      refundId: refund.id,
      amount: amount,
      cost: amount * 0.029 + 0.30  // NOTE: This fee is lost — avoid this path
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ─── FAILED CARD AT T-7 HANDLER ──────────────────────────────────
async function handleFailedScheduledCapture(appointment, errorMessage) {
  await updatePaymentInfo(appointment.id, {
    ...appointment.payment_info,
    depositStatus: 'failed',
    failureReason: errorMessage,
    failedAt: new Date().toISOString()
  });

  // Create admin alert
  await createAdminAlert(appointment.payment_info.clinicId, {
    type: 'payment_failed',
    appointmentId: appointment.id,
    message: `Card failed for upcoming appointment. Patient must update payment within 48h.`,
    severity: 'high'
  });

  // Notify patient via email
  await sendPaymentFailedEmail(appointment);
  
  // Schedule auto-cancel if not resolved within 48h
  await scheduleAutoCancel(appointment.id, { delayHours: 48 });
}

// ─── NO-SHOW RECORDING ────────────────────────────────────────────
async function recordNoShow(appointmentId) {
  // Capture the authorized hold to retain deposit
  const captureResult = await captureDeposit(appointmentId);
  await updateAppointmentStatus(appointmentId, 'no_show');
  return { depositRetained: true, captured: captureResult };
}
```

**Scheduled Jobs Configuration:**

```javascript
// jobs/paymentJobs.js

// Run hourly: Create auth holds for appointments reaching T-7 window
cron.schedule('0 * * * *', async () => {
  await processScheduledCaptures();
});

// Run every 5 min: Clean up appointments with unresolved payment failures past 48h
cron.schedule('*/5 * * * *', async () => {
  await processExpiredPaymentFailures();
});
```

**Updated Cancellation Scenario Matrix:**

| Cancelled By | Timing | Payment Status | Stripe Action | Patient Email | Cost to Clinic |
|---|---|---|---|---|---|
| Patient | > deadline, ≤7d booking | Authorized (hold) | `paymentIntents.cancel` (void) | "Hold released, no charge" | **$0** |
| Patient | > deadline, >7d booking, before T-7 | Pending (card saved) | Cancel scheduled job | "Booking cancelled, no charge" | **$0** |
| Patient | > deadline, >7d booking, after T-7 | Authorized (hold) | `paymentIntents.cancel` (void) | "Hold released, no charge" | **$0** |
| Patient | < deadline | Authorized (hold) | `paymentIntents.capture` | "Deposit retained per policy" | **$0** |
| Clinic | Any time | Authorized (hold) | `paymentIntents.cancel` (void) | "Hold released + apology" | **$0** |
| Clinic | Any time | Pending (card saved) | Cancel scheduled job | "Booking cancelled + apology" | **$0** |
| System auto-cancel | Before appt | Any | Void or cancel job | "Appointment cancelled, no charge" | **$0** |
| No-show | Post-appt | Authorized (hold) | `paymentIntents.capture` | "No-show, deposit retained" | **$0** |
| ⚠️ Rare: Cancel after capture | Post-capture | Captured | `refunds.create` | "Deposit refunded" | **~3% fee** |

**Updated Confirmation Email (Cosmetic):**

```
Deposit Policy (visible during booking and in confirmation email):

For appointments within 7 days:
• $50 hold placed on your card (not charged until your visit)
• Cancel before [deadline]: Hold released, no charge
• Cancel after [deadline] or no-show: $50 charged
• Attend appointment: $50 charged and applied toward your treatment

For appointments more than 7 days away:
• Your card is saved securely (not charged yet)
• A $50 hold will be placed 7 days before your appointment
• Cancel anytime before the hold: No charge at all
• Same cancellation policy applies once the hold is placed
```

**UI Wireframe — Booking Payment Step (Cosmetic Appointments):**

```
┌────────────────────────────────────────────────────┐
│  [← Back] Dr. Smith Dermatology        Step 5 of 6 │
├────────────────────────────────────────────────────┤
│                                                     │
│  Secure Deposit                                     │
│                                                     │
│  Your appointment: Botox Treatment                  │
│  Date: Thursday, March 5, 2026 at 2:00 PM          │
│  Required deposit: $50.00                           │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  💳 Card Number                               │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │ 4242 4242 4242 4242                     │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  │  MM/YY        CVC        ZIP                  │  │
│  │  ┌────────┐  ┌──────┐  ┌──────────┐          │  │
│  │  │ 12/27  │  │ 123  │  │ 10001    │          │  │
│  │  └────────┘  └──────┘  └──────────┘          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ ℹ️  Your card will NOT be charged today.      │  │
│  │                                               │  │
│  │ A $50 hold will be placed on your card        │  │
│  │ 7 days before your appointment. Cancel        │  │
│  │ anytime before then at no cost.               │  │
│  │                                               │  │
│  │ Cancellation Policy:                          │  │
│  │ • Before [deadline]: No charge                │  │
│  │ • After [deadline] or no-show: $50 charged    │  │
│  │ • At your visit: $50 applied to treatment     │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  🔒 Secured by Stripe. Your card data is encrypted │
│     and never stored on our servers.                │
│                                                     │
│  [← Back]                        [Confirm Booking]  │
│                                                     │
│  ●●●●●○                                           │
└────────────────────────────────────────────────────┘
```

**Note:** When appointment is ≤ 7 days away, the info box changes to:
```
│  ┌──────────────────────────────────────────────┐  │
│  │ ℹ️  A $50 hold will be placed on your card    │  │
│  │    now. You will only be charged at your      │  │
│  │    visit or if you cancel late / no-show.     │  │
│  └──────────────────────────────────────────────┘  │
```

**Admin Dashboard — Payment Status Indicators:**

```
┌──────────────────────────────────────────────────────┐
│ UPCOMING APPOINTMENTS                                 │
│                                                       │
│ Payment Status Legend:                                │
│ 🟢 Authorized (hold active)                          │
│ 🔵 Pending (card saved, hold at T-7)                 │
│ 🟡 Failed (card issue, needs attention)              │
│ ✅ Captured (deposit charged)                        │
│ ⚪ Voided (hold released on cancel)                  │
│                                                       │
│ ┌──────────────────────────────────────────────────┐ │
│ │Feb 25│Dr.Smith │Jane Doe  │Botox    │🔵 Pending│ │
│ │Feb 20│Dr.Lee   │John Smith│Mole Chk │🟢 Auth'd │ │
│ │Feb 19│Dr.Smith │Sarah Lee │Acne     │🟡 Failed │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Failed Card Alert (when T-7 capture fails):**

```
┌────────────────────────────────────────────────────┐
│ ⚠️  PAYMENT ATTENTION REQUIRED                     │
├────────────────────────────────────────────────────┤
│                                                     │
│ Card authorization failed for upcoming appointment: │
│                                                     │
│ Patient: Sarah Lee (sarah@example.com)             │
│ Appointment: Feb 26, 2:00 PM - Acne Treatment     │
│ Deposit: $50.00                                    │
│ Error: Card expired                                │
│                                                     │
│ Patient has been notified to update their card.    │
│ Auto-cancel in: 47h 23m (if not resolved)          │
│                                                     │
│ Actions:                                           │
│ [Send Payment Link] [Call Patient] [Waive Deposit] │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

## 13.2 Shared Email / Family Booking Problem

### The Problem
Email-only matching causes patient record collisions when a parent uses one email for multiple family members. "Child A" gets "Child B's" insurance info or appointment history attached to their record.

### Decision: Email + DOB Primary Matching (DOB now in MVP scope)

**Note (v2.1 Unified):** DOB is now officially in MVP scope for all patient types. It is collected during the booking form and used as the primary matching key alongside email. This aligns with Section 13.5 which already uses DOB for secure link verification. Full Name is used as a fallback when DOB is not yet on file for legacy patients.

**Updated Patient Matching Algorithm:**

```javascript
async function findOrCreatePatient(bookingData, clinicId) {
  const { fullName, email, phone, dateOfBirth } = bookingData.patient;

  // Step 1: Email + DOB exact match (primary key for shared-email families)
  if (dateOfBirth) {
    let dobMatch = await db.query(
      `SELECT * FROM patients
       WHERE clinic_id = $1
       AND LOWER(email) = LOWER($2)
       AND date_of_birth = $3`,
      [clinicId, email, dateOfBirth]
    );
    if (dobMatch.rows[0]) {
      // Update name/phone if changed
      await db.query(
        `UPDATE patients SET full_name = COALESCE(NULLIF($1, ''), full_name),
         phone = COALESCE(NULLIF($2, ''), phone), updated_at = NOW() WHERE id = $3`,
        [fullName, normalizePhone(phone), dobMatch.rows[0].id]
      );
      return { patient: dobMatch.rows[0], isNew: false };
    }
  }

  // Step 2: Fallback - Email + Name match (legacy patients without DOB)
  let patient = await db.query(
    `SELECT * FROM patients
     WHERE clinic_id = $1
     AND LOWER(email) = LOWER($2)
     AND LOWER(full_name) = LOWER($3)`,
    [clinicId, email, fullName]
  );

  if (patient.rows[0]) {
    // Exact match - update phone if changed
    if (normalizePhone(patient.rows[0].phone) !== normalizePhone(phone)) {
      await db.query(
        `UPDATE patients SET phone = $1 WHERE id = $2`,
        [normalizePhone(phone), patient.rows[0].id]
      );
    }
    return { patient: patient.rows[0], isNew: false };
  }

  // Step 2: Email match but DIFFERENT name
  // → Shared email (family). Create new patient record. Do NOT merge.
  const emailMatch = await db.query(
    `SELECT * FROM patients
     WHERE clinic_id = $1 AND LOWER(email) = LOWER($2)`,
    [clinicId, email]
  );

  if (emailMatch.rows.length > 0) {
    // Flag: shared email detected
    // Create new record, link to same email, different name
    const newPatient = await db.query(
      `INSERT INTO patients
        (clinic_id, full_name, email, phone, date_of_birth, is_shared_email_account, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       RETURNING *`,
      [clinicId, fullName, email, normalizePhone(phone), dateOfBirth]
    );

    // Alert admin: shared email detected
    await flagSharedEmailForAdmin(email, clinicId, emailMatch.rows);

    return { patient: newPatient.rows[0], isNew: true, sharedEmail: true };
  }

  // Step 4: Phone + name fuzzy match (same person, changed email)
  const phoneMatch = await db.query(
    `SELECT *, similarity(LOWER(full_name), LOWER($1)) AS name_sim
     FROM patients
     WHERE clinic_id = $2 AND phone = $3
     AND similarity(LOWER(full_name), LOWER($1)) > 0.85
     ORDER BY name_sim DESC
     LIMIT 1`,
    [fullName, clinicId, normalizePhone(phone)]
  );

  if (phoneMatch.rows[0]) {
    // Same person, update their email and DOB
    await db.query(
      `UPDATE patients SET email = $1, date_of_birth = COALESCE($3, date_of_birth) WHERE id = $2`,
      [email, phoneMatch.rows[0].id, dateOfBirth]
    );
    return { patient: phoneMatch.rows[0], isNew: false };
  }

  // Step 5: No match - create new patient
  const newPatient = await db.query(
    `INSERT INTO patients
      (clinic_id, full_name, email, phone, date_of_birth, is_shared_email_account, created_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW())
     RETURNING *`,
    [clinicId, fullName, email, normalizePhone(phone), dateOfBirth]
  );

  return { patient: newPatient.rows[0], isNew: true };
}
```

**Database Schema Update:**

```sql
-- Add to patients table
ALTER TABLE patients
  ADD COLUMN date_of_birth DATE,  -- DOB now in MVP scope (v2.1 Unified)
  ADD COLUMN is_shared_email_account BOOLEAN DEFAULT false;

-- Index for DOB-based matching (primary key for shared-email families)
CREATE INDEX idx_patients_email_dob ON patients(clinic_id, LOWER(email), date_of_birth);
-- Fallback index for name-based matching (legacy patients without DOB)
CREATE INDEX idx_patients_email ON patients(clinic_id, LOWER(email));
CREATE INDEX idx_patients_email_name ON patients(clinic_id, LOWER(email), LOWER(full_name));
```

**Admin Alert - Shared Email Detection:**

```
┌────────────────────────────────────────────────────┐
│ ℹ️  Shared Email Account Detected                  │
├────────────────────────────────────────────────────┤
│                                                     │
│ The email john@example.com is used by:             │
│                                                     │
│ • John Smith (existing patient, 3 appointments)    │
│ • Emily Smith (new booking, Feb 20)                │
│                                                     │
│ Separate records created. Confirmation emails      │
│ for both will go to john@example.com.              │
│                                                     │
│ [View Records] [Merge if Same Person] [Dismiss]    │
│                                                     │
└────────────────────────────────────────────────────┘
```

**Confirmation Email - Shared Account Note:**

When `is_shared_email_account = true`, include in email:

```
This confirmation is for Emily Smith's appointment.
If you did not make this booking, please call us at [phone].
```

---

## 13.3 "Any Available" Provider Assignment Logic

### The Problem
"First available" is ambiguous. If Providers A, B, and C all have 9:00 AM free, random assignment may overwork one provider while others are underutilized.

### Decision: Round-Robin with Fewest-Appointments-Today Tiebreaker

**Assignment Algorithm:**

```javascript
async function assignProviderAutomatically(clinicId, appointmentTypeId, slotDatetime) {
  // 1. Find all providers who:
  //    - Are active
  //    - Can perform this appointment type
  //    - Have this slot available (not booked, not blocked)
  const availableProviders = await db.query(
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
     ORDER BY
       appointments_today ASC,     -- Fewest appointments today first
       last_assigned ASC NULLS FIRST  -- Round-robin tiebreaker
     LIMIT 1`,
    [clinicId, appointmentTypeId, slotDatetime]
  );

  if (!availableProviders.rows[0]) {
    return null; // No provider available
  }

  // 2. Update last_auto_assigned_at for round-robin tracking
  await db.query(
    `UPDATE providers SET last_auto_assigned_at = NOW() WHERE id = $1`,
    [availableProviders.rows[0].id]
  );

  return availableProviders.rows[0];
}

// NOTE: This logic is executed at the "Slot Reservation" step (POST /api/public/slots/reserve)
// to lock the specific provider immediately, preventing the race condition where
// "Any Available" is selected but the slot is taken before form submission.
```

**Database Schema Update:**

```sql
-- Add to providers table
ALTER TABLE providers
  ADD COLUMN last_auto_assigned_at TIMESTAMP WITH TIME ZONE;

-- Index for assignment query
CREATE INDEX idx_providers_auto_assign
  ON providers(clinic_id, is_active, last_auto_assigned_at);
```

**Assignment Priority Rules:**

```
1. Primary: Fewest appointments today
   → Ensures workload balance across providers

2. Tiebreaker: Round-robin (last_auto_assigned_at)
   → If two providers have equal appointments today,
     assign to whoever was assigned least recently

3. Final tiebreaker: display_order
   → If truly equal, use clinic-defined display order
```

**UI Display for "Any Available" Confirmation:**

```
┌────────────────────────────────────────────────────┐
│ Booking Confirmed                                   │
│                                                     │
│ Your provider: Dr. Michael Lee                      │ ← Show assigned provider
│ (Automatically assigned based on availability)     │
│                                                     │
│ If you have a provider preference, please call us  │
│ at [clinic_phone] to reschedule.                   │
└────────────────────────────────────────────────────┘
```

---

## 13.4 Race Condition - Slot Reservation System

### The Problem
Two patients simultaneously select the same slot. Both pass availability check. Both submit. Both get confirmation emails. Result: double booking.

### Decision: Slot Reservation Table (10-Minute Hold)

**Mechanism:** When patient selects a time slot (before completing the form), the system places a temporary hold. No other patient can book that exact slot + provider combination during the hold period.

**Database Schema:**

```sql
CREATE TABLE slot_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  -- The held slot
  slot_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),

  -- Reservation holder (anonymous session, not yet a patient)
  session_token VARCHAR(64) NOT NULL UNIQUE,

  -- Expiry
  reserved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- reserved_at + 10 minutes

  -- Outcome
  converted_to_appointment_id UUID REFERENCES appointments(id), -- Set on booking
  released_at TIMESTAMP WITH TIME ZONE  -- Set on explicit release or expiry
);

-- Indexes
CREATE INDEX idx_slot_reservations_slot
  ON slot_reservations(provider_id, slot_datetime)
  WHERE released_at IS NULL AND expires_at > NOW();

CREATE INDEX idx_slot_reservations_expiry
  ON slot_reservations(expires_at)
  WHERE released_at IS NULL;

CREATE INDEX idx_slot_reservations_session
  ON slot_reservations(session_token);
```

**Reservation Flow:**

```
Step 3 (Patient selects slot):
  → POST /api/public/slots/reserve
  → System creates reservation (10-min TTL)
  → Returns session_token to frontend
  → Frontend stores token in memory

Step 4 (Patient fills contact form):
  → Reservation is "holding" the slot
  → Other patients see slot as unavailable

Step 5 (Patient submits booking):
  → POST /api/public/appointments
  → Includes session_token + payment_method_id
  → System validates token and slot availability
  → System processes payment (Auth Hold if ≤7d, or Save Card if >7d)
  → Creates appointment, marks slot_reservation.converted_to_appointment_id
  → Releases reservation hold

If patient abandons form:
  → Reservation expires after 10 minutes
  → Slot becomes available again (auto-released by expiry)
```

**API Endpoints:**

**POST /api/public/slots/reserve**

```json
Request:
{
  "clinicSlug": "dr-smith-dermatology",
  "providerId": "provider-uuid-1",
  "appointmentTypeId": "type-uuid-1",
  "slotDatetime": "2026-02-20T14:00:00Z"
}

Response (200 OK):
{
  "success": true,
  "data": {
    "sessionToken": "abc123def456...",
    "expiresAt": "2026-02-13T10:20:00Z",
    "expiresInSeconds": 600,
    "slot": {
      "datetime": "2026-02-20T14:00:00Z",
      "displayTime": "2:00 PM EST",
      "provider": "Dr. Sarah Smith"
    }
  }
}

Response (409 Conflict - Slot taken):
{
  "success": false,
  "error": {
    "code": "SLOT_RESERVED",
    "message": "This slot was just selected by another patient. Please choose another time.",
    "availableAlternatives": [
      {"datetime": "2026-02-20T14:30:00Z", "displayTime": "2:30 PM EST"},
      {"datetime": "2026-02-20T15:00:00Z", "displayTime": "3:00 PM EST"}
    ]
  }
}
```

**Reservation Check (in slot availability query):**

```javascript
// When generating available slots, exclude reserved ones
async function getAvailableSlots(providerId, date, clinicId) {
  return await db.query(
    `SELECT slot_datetime
     FROM generate_slots($1, $2, $3) AS slot_datetime
     WHERE NOT EXISTS (
       -- Exclude booked appointments
       SELECT 1 FROM appointments a
       WHERE a.provider_id = $1
         AND a.scheduled_datetime = slot_datetime
         AND a.status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')
     )
     AND NOT EXISTS (
       -- Exclude currently reserved slots
       SELECT 1 FROM slot_reservations sr
       WHERE sr.provider_id = $1
         AND sr.slot_datetime = slot_datetime
         AND sr.released_at IS NULL
         AND sr.expires_at > NOW()
     )`,
    [providerId, date, clinicId]
  );
}
```

**Frontend - Countdown Timer:**

```
┌────────────────────────────────────────────────────┐
│ ⏰ Slot reserved for you                           │
│    Dr. Sarah Smith - Feb 20 at 2:00 PM            │
│    Please complete your booking within: 9:32       │ ← Countdown
└────────────────────────────────────────────────────┘
```

**Cleanup Job (Scheduled every minute):**

```javascript
// Release expired reservations
async function releaseExpiredReservations() {
  await db.query(
    `UPDATE slot_reservations
     SET released_at = NOW()
     WHERE expires_at < NOW()
       AND released_at IS NULL
       AND converted_to_appointment_id IS NULL`
  );
}

// node-cron: run every minute
cron.schedule('* * * * *', releaseExpiredReservations);
```

**POST /api/public/appointments - Updated Validation:**

```javascript
// Before creating appointment, validate reservation
async function createAppointment(req, res) {
  const { sessionToken, ...bookingData } = req.body;

  // 1. Validate session token
  const reservation = await db.query(
    `SELECT * FROM slot_reservations
     WHERE session_token = $1
       AND released_at IS NULL
       AND expires_at > NOW()`,
    [sessionToken]
  );

  if (!reservation.rows[0]) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'RESERVATION_EXPIRED',
        message: 'Your slot reservation has expired. Please select a new time.'
      }
    });
  }

  // 2. Proceed with booking (slot is safely reserved)
  // CRITICAL: The sessionToken MUST be included in the booking request to validate the reservation.
  // ...
}
```

---

## 13.5 Secure Link Verification - DOB Instead of Email

### The Problem
De-identified email → patient clicks link → asked to "verify email" → redundant friction. They already proved they own the email by clicking the link.

### Decision: Date of Birth Verification on Secure Page

**Verification Flow:**

```
1. Patient receives de-identified email
2. Patient clicks [View Secure Appointment Details]
3. Lands on: smartbook.app/secure/appointment/:token
4. Sees:

  ┌──────────────────────────────────────────────────┐
  │ Dr. Smith Dermatology                            │
  │                                                   │
  │ 🔒 Secure Appointment Details                    │
  │                                                   │
  │ To protect your privacy, please confirm          │
  │ your identity:                                   │
  │                                                   │
  │ Date of Birth                                    │
  │ [MM] / [DD] / [YYYY]                            │
  │                                                   │
  │ [View My Appointment]                            │
  │                                                   │
  │ This link expires in 23 hours.                   │
  └──────────────────────────────────────────────────┘

5. Patient enters DOB
6. If correct: Show full appointment details
7. If incorrect (3 attempts): Lock page, show clinic phone number
```

**Why DOB?**
- Something the patient knows (not just "has access to their email")
- Non-redundant (email was already proven by clicking the link)
- HIPAA-compliant identity verification
- Low friction (one familiar field)

**Note on DOB Availability (v2.1 Unified):** DOB is now a required field collected during the booking form for ALL patient types (medical, cosmetic, and new). This unifies the verification and matching systems. For existing legacy patients where DOB is not yet on file, the system will prompt to collect DOB during their next booking. Phone last-4 digits is used as a temporary fallback until DOB is collected.

**Database Schema Update:**

```sql
-- Updated secure_appointment_tokens
ALTER TABLE secure_appointment_tokens
  ADD COLUMN verification_method VARCHAR(20) DEFAULT 'dob';
  -- 'dob', 'phone_last4' (fallback)

ALTER TABLE secure_appointment_tokens
  ADD COLUMN failed_attempts INTEGER DEFAULT 0;

ALTER TABLE secure_appointment_tokens
  ADD COLUMN locked_at TIMESTAMP WITH TIME ZONE;
```

**API Endpoint:**

**POST /api/secure/appointment/:token/verify**

```json
Request:
{
  "verificationMethod": "dob",
  "value": "1985-03-15"  // or last4: "6543"
}

Response (200 OK - Verified):
{
  "success": true,
  "data": {
    "appointment": {
      "confirmationNumber": "SMTH-2026-0220-001",
      "appointmentType": "Mole Check",
      "date": "Thursday, February 20, 2026",
      "time": "2:00 PM EST",
      "provider": "Dr. Sarah Smith",
      "clinicAddress": "123 Main St, New York, NY 10001",
      "clinicPhone": "555-123-4567"
    },
    "actions": {
      "confirmLink": "/api/public/appointments/appt-uuid-123/confirm",
      "cancelLink": "/api/public/appointments/appt-uuid-123/cancel"
    }
  }
}

Response (401 Unauthorized):
{
  "success": false,
  "error": {
    "code": "VERIFICATION_FAILED",
    "message": "Date of birth does not match. 2 attempts remaining.",
    "attemptsRemaining": 2
  }
}

Response (423 Locked):
{
  "success": false,
  "error": {
    "code": "PAGE_LOCKED",
    "message": "Too many incorrect attempts. Please call us at 555-123-4567.",
    "clinicPhone": "555-123-4567"
  }
}
```

**Verification Logic:**

```javascript
async function verifySecureToken(token, verificationMethod, value) {
  // 1. Get token
  const tokenRecord = await db.query(
    `SELECT * FROM secure_appointment_tokens
     WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );

  if (!tokenRecord.rows[0]) {
    throw new Error('Token invalid or expired');
  }

  // 2. Check if locked (too many failed attempts)
  if (tokenRecord.rows[0].locked_at) {
    throw new Error('Page locked - too many failed attempts');
  }

  // 3. Get patient for verification
  const patient = await getPatientByAppointment(tokenRecord.rows[0].appointment_id);

  // 4. Verify DOB or phone last 4
  let verified = false;

  if (verificationMethod === 'dob' && patient.date_of_birth) {
    verified = patient.date_of_birth === value;
  } else {
    // Fallback: last 4 digits of phone
    const last4 = patient.phone.slice(-4);
    verified = last4 === value;
  }

  if (!verified) {
    // Increment failed attempts
    const newAttempts = tokenRecord.rows[0].failed_attempts + 1;

    if (newAttempts >= 3) {
      // Lock the page
      await db.query(
        `UPDATE secure_appointment_tokens
         SET failed_attempts = $1, locked_at = NOW() WHERE id = $2`,
        [newAttempts, tokenRecord.rows[0].id]
      );
      throw new Error('LOCKED');
    }

    await db.query(
      `UPDATE secure_appointment_tokens
       SET failed_attempts = $1 WHERE id = $2`,
      [newAttempts, tokenRecord.rows[0].id]
    );

    throw new Error(`VERIFICATION_FAILED:${3 - newAttempts}`);
  }

  // 5. Mark as accessed
  await db.query(
    `UPDATE secure_appointment_tokens
     SET accessed_at = NOW() WHERE id = $1`,
    [tokenRecord.rows[0].id]
  );

  return getAppointmentDetails(tokenRecord.rows[0].appointment_id);
}
```

---

## 13.6 Insurance Queue - Urgent Flags for Same/Next-Day Bookings

### The Problem
The T-24h scheduler job triggers once daily. If a patient books a same-day appointment, the insurance queue never flags it as urgent. Patient arrives, insurance invalid, chaos ensues.

### Decision: Real-Time Urgency Flag on Booking + Instant Admin Alert

**Urgency Classification:**

```javascript
// Called immediately when appointment is created
async function classifyInsuranceUrgency(appointment, clinic) {
  if (appointment.appointmentType.category !== 'medical') {
    return null; // Cosmetic - no insurance needed
  }

  const now = new Date();
  const apptTime = new Date(appointment.scheduled_datetime);
  const hoursUntilAppt = (apptTime - now) / (1000 * 60 * 60);

  let urgency = null;

  if (hoursUntilAppt <= 2) {
    urgency = 'critical'; // Patient arriving very soon
  } else if (hoursUntilAppt <= 24) {
    urgency = 'high';     // Same-day or next morning
  } else if (hoursUntilAppt <= 48) {
    urgency = 'medium';   // Tomorrow or day after
  } else {
    urgency = 'standard'; // Plenty of time
  }

  // Save to appointment
  await db.query(
    `UPDATE appointments
     SET insurance_info = jsonb_set(
       insurance_info,
       '{insuranceUrgency}',
       $1::jsonb
     )
     WHERE id = $2`,
    [JSON.stringify(urgency), appointment.id]
  );

  // For critical and high: send immediate admin alert
  if (urgency === 'critical' || urgency === 'high') {
    await sendImmediateInsuranceAlert(appointment, clinic, urgency);
  }

  return urgency;
}
```

**Immediate Admin Alert Email (for critical/high):**

```
Subject: 🚨 URGENT: Insurance Verification Needed - [Patient] at [Time]

A medical appointment requires IMMEDIATE insurance verification:

Patient: John Smith
Appointment: TODAY at 2:00 PM (2.5 hours from now)
Type: Mole Check
Insurance: Blue Cross (Policy: ABC123456)

This appointment was just booked and requires verification
before the patient arrives.

[Verify Insurance Now →]

If you cannot verify in time, please call the patient:
555-987-6543

SmartBook Admin System
```

**Insurance Queue UI - Updated with Urgency:**

```
┌──────────────────────────────────────────────────────┐
│ INSURANCE VERIFICATION QUEUE                         │
│                                                       │
│ 🚨 CRITICAL - Verify Immediately                     │
│ ┌────────────────────────────────────────────────┐   │
│ │ TODAY 2:00 PM (2.5 hrs) - John Smith           │   │
│ │ Mole Check | Blue Cross (ABC123456)            │   │
│ │ ⏰ Patient arriving soon!                       │   │
│ │ [Verify Now] [Call Patient: 555-987-6543]      │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ⚠️  HIGH PRIORITY - Verify Today                     │
│ ┌────────────────────────────────────────────────┐   │
│ │ TOMORROW 9:00 AM (18 hrs) - Sarah Lee          │   │
│ │ Acne Treatment | Aetna (XYZ789012)             │   │
│ │ [Verify Now] [Call Patient: 555-111-2222]      │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ 📋 STANDARD                                          │
│ ┌────────────────────────────────────────────────┐   │
│ │ Feb 25 at 10:00 AM (12 days) - Bob Johnson     │   │
│ │ Surgical Removal | Medicare (XYZ001)           │   │
│ │ [Verify] [View]                                │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**Dashboard Banner - Context-Aware:**

```javascript
// Show different banners based on urgency level
function getInsuranceBannerMessage(unverifiedAppointments) {
  const critical = unverifiedAppointments.filter(a =>
    a.insuranceUrgency === 'critical'
  );
  const high = unverifiedAppointments.filter(a =>
    a.insuranceUrgency === 'high'
  );
  const standard = unverifiedAppointments.filter(a =>
    a.insuranceUrgency === 'standard' || a.insuranceUrgency === 'medium'
  );

  if (critical.length > 0) {
    return {
      type: 'critical',
      message: `🚨 ${critical.length} appointment(s) need IMMEDIATE insurance verification (arriving today)`,
      link: '/admin/insurance-queue?filter=critical'
    };
  }

  if (high.length > 0) {
    return {
      type: 'high',
      message: `⚠️ ${high.length} same-day/next-day appointment(s) need insurance verification`,
      link: '/admin/insurance-queue?filter=high'
    };
  }

  if (standard.length > 0) {
    return {
      type: 'info',
      message: `ℹ️ ${standard.length} upcoming appointment(s) need insurance verification`,
      link: '/admin/insurance-queue'
    };
  }

  return null;
}
```

**Updated Scheduler - T-24h Check (Now Supplementary Only):**

```javascript
// This job now only catches "standard" cases missed by real-time alerts
async function insuranceVerificationDailyCheck() {
  const tomorrow = addDays(new Date(), 1);

  const unverified = await db.query(
    `SELECT a.*, p.full_name, p.email, p.phone
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN appointment_types at ON a.appointment_type_id = at.id
     WHERE at.category = 'medical'
       AND DATE(a.scheduled_datetime) = $1
       AND (a.insurance_info->>'verificationStatus') = 'pending'
       AND (a.insurance_info->>'insuranceUrgency') = 'standard'
       AND a.status NOT IN ('cancelled_by_patient', 'cancelled_by_clinic')`,
    [tomorrow]
  );

  // Only send summary for standard urgency (critical/high already alerted)
  if (unverified.rows.length > 0) {
    await sendDailySummaryAlert(unverified.rows);
  }
}
```

---

# APPENDIX: DECISION LOG

## Critical Decisions Made in SRS v2.0

| Decision | Rationale |
|----------|-----------|
| Include multi-provider in MVP | Target market (1-5 providers) cannot use system without this |
| Patient chooses provider during booking | Industry standard, patients have preferences |
| HIPAA consent checkbox required | Legal requirement for sending PHI via email |
| Manual no-show deposit charging | Reduces legal liability, allows admin discretion |
| Staggered waitlist notifications | Makes priority system meaningful, fair distribution |
| Insurance verification tracking | Essential workflow missing from v1.0 |
| Email-based patient matching | Most reliable unique identifier for duplicate prevention |
| Explicit timezone storage | Prevents daylight saving time bugs |

---

# DOCUMENT APPROVAL

**Version:** 2.0 FINAL  
**Status:** Ready for Implementation  
**Approved By:** [Project Manager]  
**Date:** February 11, 2026  

**Next Steps:**
1. UI/UX wireframe design (based on Section 5)
2. Database migration scripts
3. Development environment setup
4. Week 1 implementation kickoff

---

*This SRS addresses all critical gaps identified in v1.0 and is ready for production development.*