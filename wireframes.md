# SmartBook Low-Fidelity Wireframes (v2.1)

This document outlines the step-by-step wireframes for the SmartBook scheduling system, incorporating all business logic from the SRS v2.1.

---

## 1. Patient Booking Flow

### Step 1: Patient Status
```
┌────────────────────────────────────────────────────┐
│ Dr. Smith Dermatology                  Step 1 of 6 │
├────────────────────────────────────────────────────┤
│                                                    │
│ Welcome to SmartBook!                              │
│ Are you a new or returning patient?                │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ [●] I am a NEW patient                        │  │
│  │     (First time at this clinic)               │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ [ ] I am a RETURNING patient                 │  │
│  │     (I have been here before)                 │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│ [Continue →]                                       │
│                                                    │
│ ●○○○○○                                             │
└────────────────────────────────────────────────────┘
```

### Step 2: Treatment Selection
```
┌────────────────────────────────────────────────────┐
│ [← Back] Select Treatment              Step 2 of 6 │
├────────────────────────────────────────────────────┤
│                                                    │
│ What can we help you with today?                   │
│                                                    │
│ MEDICAL (Insurance-based)                          │
│ ┌──────────────────────────────────────────────┐  │
│ │ [ ] Mole Check (30 min)                      │  │
│ │ [ ] Acne Evaluation (30 min)                 │  │
│ │ [ ] Rash/Skin Concern (30 min)               │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ COSMETIC (Self-pay, $50 deposit required)          │
│ ┌──────────────────────────────────────────────┐  │
│ │ [ ] Botox Treatment (45 min)                 │  │
│ │ [ ] Dermal Fillers (60 min)                  │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ [Continue →]                                       │
│                                                    │
│ ●●○○○○                                             │
└────────────────────────────────────────────────────┘
```

### Step 3: Provider Selection
```
┌────────────────────────────────────────────────────┐
│ [← Back] Select Provider               Step 3 of 6 │
├────────────────────────────────────────────────────┤
│                                                    │
│ Who would you like to see?                         │
│ (Showing providers qualified for [Treatment Name]) │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ [●] Any Available Provider (Recommended)      │  │
│  │     (Shows the earliest available slots)      │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ [ ] Dr. Sarah Smith, MD                       │  │
│  │     Specializes in Medical Dermatology        │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ [ ] Dr. Michael Lee, MD                       │  │
│  │     Specializes in Cosmetics & Medical        │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│ [Continue →]                                       │
│                                                    │
│ ●●●○○○                                             │
└────────────────────────────────────────────────────┘
```

### Step 4: Date & Time Selection (Slot Reservation)
```
┌────────────────────────────────────────────────────┐
│ [← Back] Choose Time                   Step 4 of 6 │
├────────────────────────────────────────────────────┤
│                                                    │
│ ⏰ Slot hold: 10:00 (Starts after selection)        │
│                                                    │
│ [ < ] February 2026 [ > ]                          │
│ ┌────┬────┬────┬────┬────┬────┬────┐             │
│ │ S  │ M  │ T  │ W  │ T  │ F  │ S  │             │
│ ├────┼────┼────┼────┼────┼────┼────┤             │
│ │ 1  │ 2  │ 3  │ 4  │ 5  │ 6  │ 7  │             │
│ │ 8  │ 9  │ 10 │ 11 │ 12 │ 13 │ 14 │             │
│ │ 15 │ 16 │ 17 │ 18 │ 19 │[20]│ 21 │             │
│ └────┴────┴────┴────┴────┴────┴────┘             │
│                                                    │
│ Available slots for Feb 20:                        │
│ ┌────────┐ ┌────────┐ ┌────────┐                 │
│ │ 9:00 AM│ │ 9:30 AM│ │10:00 AM│                 │
│ └────────┘ └────────┘ └────────┘                 │
│ ┌────────┐ ┌────────┐ ┌────────┐                 │
│ │ 2:00 PM│ │ 2:30 PM│ │ 3:00 PM│                 │
│ └────────┘ └────────┘ └────────┘                 │
│                                                    │
│ ●●●●○○                                             │
└────────────────────────────────────────────────────┘
```

### Step 5: Patient Info & HIPAA Consent
```
┌────────────────────────────────────────────────────┐
│ [← Back] Your Information              Step 5 of 6 │
├────────────────────────────────────────────────────┤
│                                                    │
│ Full Name: [_______________________]               │
│ Email:     [_______________________]               │
│ Phone:     [_______________________]               │
│ DOB:       [MM / DD / YYYY] (Required)             │
│                                                    │
│ Communication Preferences (HIPAA):                 │
│ [ ] I consent to email reminders                   │
│                                                    │
│ Privacy Level:                                     │
│ (●) Standard (Include appointment name)            │
│ ( ) Private (Secure link only, no PHI)             │
│                                                    │
│ [ ] I agree to the [Clinic Policy]                 │
│                                                    │
│ [Continue →]                                       │
│                                                    │
│ ●●●●●○                                             │
└────────────────────────────────────────────────────┘
```

### Step 6: Secure Deposit (Cosmetic Only)
```
┌────────────────────────────────────────────────────┐
│ [← Back] Secure Deposit                Step 6 of 6 │
├────────────────────────────────────────────────────┤
│                                                    │
│ Appointment: Botox on Feb 20 at 2:00 PM            │
│ Deposit Amount: $50.00                             │
│                                                    │
│ ┌──────────────────────────────────────────────┐  │
│ │ 💳 Card Number (Stripe Element)               │  │
│ │ [__________________________________________] │  │
│ └──────────────────────────────────────────────┘  │
│                                                    │
│ ℹ️ HYBRID PAYMENT NOTICE:                          │
│ • If booking is >7 days away: Card is saved,       │
│   hold placed at T-7 days.                         │
│ • If booking is ≤7 days away: $50 hold placed now. │
│ • No charge today unless you cancel late.          │
│                                                    │
│ [Confirm Booking]                                  │
│                                                    │
│ ●●●●●●                                             │
└────────────────────────────────────────────────────┘
```

---

## 2. Admin Dashboard Wireframes

### Main Schedule & Filters
```
┌──────────────────────────────────────────────────────┐
│ DASHBOARD - February 20, 2026                        │
├──────────────────────────────────────────────────────┤
│ Provider: [All Providers ▼]  Status: [All ▼]        │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Time  │ Provider │ Patient    │ Type     │Status │ │
│ ├───────┼──────────┼────────────┼──────────┼───────┤ │
│ │ 9:00  │ Dr.Smith │ John Doe   │ Medical  │ 🟢    │ │
│ │ 9:30  │ Dr.Lee   │ Jane Smith │ Botox    │ 🔵    │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [Insurance Queue] [Waitlist (3)] [Settings]          │
└──────────────────────────────────────────────────────┘
```

### Insurance Verification Queue
```
┌──────────────────────────────────────────────────────┐
│ INSURANCE QUEUE                                      │
├──────────────────────────────────────────────────────┤
│ 🚨 CRITICAL (Arriving Today)                         │
│ ┌────────────────────────────────────────────────┐   │
│ │ John Doe - 2:00 PM - Mole Check                │   │
│ │ [Verify Now] [Call Patient]                    │   │
│ └────────────────────────────────────────────────┘   │
│                                                      │
│ 📋 STANDARD                                          │
│ ┌────────────────────────────────────────────────┐   │
│ │ Alice Brown - Feb 22 - Acne                    │   │
│ │ [Verify]                                       │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Treatment Management (Mapping)
```
┌────────────────────────────────────────────────────┐
│ Edit Treatment: Botox                              │
├────────────────────────────────────────────────────┤
│ Name: [Botox Treatment]                            │
│                                                    │
│ Qualified Providers:                               │
│ [✓] Dr. Sarah Smith                                │
│ [✓] Dr. Michael Lee                                │
│                                                    │
│ [Save Changes]                                     │
└────────────────────────────────────────────────────┘

### Waitlist Management (Staggered)
```
┌──────────────────────────────────────────────────────┐
│ WAITLIST - Mole Check Appointments                   │
├──────────────────────────────────────────────────────┤
│ 🔴 URGENT (Notified first)                           │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Jane Doe | Priority: 105 | [Notify Now]          │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ 🟡 HIGH PRIORITY (Wait 15 min after Urgent)          │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Bob Johnson | Priority: 55 | [Select]            │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ Notification Strategy:                               │
│ (●) Automatic Staggered  ( ) Manual Selection        │
│                                                      │
│ [Execute Staggered Notifications]                    │
└──────────────────────────────────────────────────────┘
```

### Provider Schedule Management
```
┌────────────────────────────────────────────────────┐
│ Edit Schedule - Dr. Sarah Smith                    │
├────────────────────────────────────────────────────┤
│ Weekly Hours:                                      │
│ [✓] Mon: 09:00 AM - 05:00 PM                       │
│ [✓] Tue: 09:00 AM - 05:00 PM                       │
│ ...                                                │
│                                                    │
│ Blocked Dates (Vacation/Sick):                     │
│ • March 15 - March 22 (Spring Break) [Remove]      │
│ [+ Add Blocked Period]                             │
│                                                    │
│ [Save Schedule]                                    │
└────────────────────────────────────────────────────┘
```

### Insurance Verification Modal
```
┌──────────────────────────────────────────────────────┐
│ VERIFY INSURANCE: John Doe                     [X]   │
├──────────────────────────────────────────────────────┤
│ Provider: Blue Cross | Policy: ABC123456             │
│ DOB: 03/15/1985                                      │
│                                                      │
│ Verification Result:                                 │
│ [●] Verified - Policy Active                         │
│ [ ] Failed - Policy Inactive/Error                   │
│                                                      │
│ Copay Amount: [$30.00]                               │
│ Notes: [__________________________________________] │
│                                                      │
│ [Cancel]                              [Save Result]  │
└──────────────────────────────────────────────────────┘
```
```
