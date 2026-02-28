# Calendarsome SmartBook Application

A comprehensive medical booking and management system designed for medical spas and clinics.

## Core Features
- **Intelligent Booking:** Provider-treatment mapping and automated slot management.
- **Financial Security:** Hybrid payment strategy with T-7 day authorization holds and manual no-show fee capture.
- **Insurance Management:** Dedicated verification queue for medical procedures.
- **Communication:** Automated patient alerts for bookings, insurance updates, and payment recovery.
- **Admin Dashboard:** Real-time stats, schedule management, patient record merging, and security hardening.
- **Compliance:** HIPAA-compliant data de-identification and secure token-based appointment views.

## Technical Stack
- **Backend:** Node.js, Express, PostgreSQL, JWT, Stripe, Nodemailer (Mailtrap).
- **Frontend:** Vanilla JS/CSS (Stitch-standardized), HTML5.
- **Security:** Helmet, express-rate-limit, single-use secure tokens.

## Setup Instructions

### 1. Database Setup
Ensure PostgreSQL is running and run the following commands:
```bash
createdb calendarsome
npm run seed
```

### 2. Environment Variables
Create a `.env` file in the `server` directory with the following:
```env
PORT=5000
DATABASE_URL=postgres://user:pass@localhost:5432/calendarsome
JWT_SECRET=your-secret-key
STRIPE_SECRET_KEY=your-stripe-key
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-user
SMTP_PASS=your-mailtrap-pass
FROM_EMAIL=no-reply@yourclinic.com
```

### 3. Run Application
```bash
cd server
npm install
npm run dev
```

## Security & Maintenance
- **Rate Limiting:** Auth (20 req / 15m), Verification (10 req / 1h).
- **Backups:** Regular database snapshots recommended.
- **PHS:** Ensure patient consent flags are respected for PHI delivery.
