# CareCircle

> **Smart Elderly Care & Medication Management Platform**  
> Built for the Google Hackathon · Next.js 14 App Router · Firestore · Google Gemini API · Nodemailer · Vercel

---

## 1. What is CareCircle?

CareCircle is a collaborative healthcare platform that helps elderly individuals manage daily medications, appointments, and care routines while keeping caretakers and family informed in real time.

Three distinct roles share **one healthcare profile** through secure passcode-based access:

| Role | Access & Permissions |
|---|---|
| **Elder** | Full control — marks doses as taken/skipped, approves or rejects caretaker proposals, rotates passcodes, configures escalation. |
| **Caretaker** | Proposes schedule additions, updates, or cancellations; logs doses on behalf of the elder; monitors adherence and proposal status. |
| **Family** | Read-only oversight of adherence statistics, medication schedules, and upcoming appointments. |

---

## 2. Core & Standout Features

### Core Capabilities
- 💊 **Medication Scheduling** — Name, dose, times/day, food requirement, start/end dates, and pill counts with automatic decrement.
- 📋 **Dose Logging** — Deterministic dose records (`${medId}_${YYYYMMDDHHmm}`) preventing duplicate logging.
- 📅 **Appointments** — Doctor, clinic location, date/time, notes, with automated 24-hour and 2-hour email reminders.
- 📊 **Adherence Engine** — 7-day and 30-day adherence tracking strictly excluding future doses.
- ✅ **Elder Approval Workflow** — Caretaker proposals route through `pendingChanges` requiring explicit Elder approval via a single Firestore transaction before touching active schedules.
- 🗂️ **Immutable Audit Log** — Append-only record of every login, proposal, approval, rejection, and dose action, with automatic sensitive data redaction.
- 📧 **Proactive Email Reminders** — Upcoming dose (15 min prior), missed dose (30 min overdue), and appointment alerts.
- 🔁 **Idempotent Reminders** — Deterministic Firestore doc IDs (`${refId}_${type}`) and atomic locks guarantee zero double-sending.

### Standout Features
- 🔗 **One-Tap Email Actions** — Mark Taken, Snooze 15 Min, or Skip Dose directly from reminder emails via signed single-use JWTs (`actionTokens`). Email scanner pre-fetches are protected via a confirmation landing page (`/action/[token]`).
- 🎙️ **Gemini Natural-Language Entry** — Type or speak plain instructions (e.g. *"Metformin 500mg twice daily with breakfast and dinner, 60 pills"*); Gemini extracts structured JSON validated by Zod for human-in-the-loop Elder confirmation.
- 💡 **Gemini Medication Explanations** — Plain-language 6th-grade reading level summaries with hardcoded medical disclaimers cached in Firestore.
- 🚨 **Multi-Tier Escalation Ladder** — Progressively alerts the care circle if a dose remains unconfirmed (Elder at 30 min → Caretaker at 60 min → Family at 120 min), automatically halting once logged.
- 📰 **Weekly Family Digest** — Pre-computed adherence statistics narrated into warm, encouraging weekly emails for family members.

---

## 3. Architecture & System Flow

```mermaid
graph TD
    subgraph Clients["Elderly & Family User Interfaces"]
        E[Elder Today Screen<br/>18px+ text, High Contrast, WCAG AA]
        C[Caretaker Dashboard<br/>Adherence & Proposals]
        F[Family Dashboard<br/>Read-Only Portal]
        A[One-Tap Action Page<br/>Anti-Scanner Pre-fetch Guard]
    end

    subgraph API["Next.js App Router API Routes (Vercel)"]
        AUTH[/api/auth/*<br/>Multi-Role Login & Rotation]
        MEDS[/api/medications/*<br/>Medication & Dose CRUD]
        PEND[/api/pending/*<br/>Elder Approvals]
        ACT[/api/action/*<br/>One-Tap Tokens]
        CRON[/api/cron/tick<br/>Timing-Safe Cron Tick]
        GEMINI[/api/gemini/*<br/>NL Parse & Drug Explain]
    end

    subgraph External["External Triggers & Schedulers"]
        SCHED[cron-job.org<br/>Calls /api/cron/tick every 5m with x-cron-secret]
    end

    subgraph Services["Server-Side Services"]
        FS[(Cloud Firestore<br/>firebase-admin)]
        GENAI[Google Gemini API<br/>@google/genai gemini-2.5-flash]
        SMTP[Nodemailer SMTP<br/>High-contrast HTML & Text]
    end

    E --> API
    C --> API
    F --> API
    A --> API
    SCHED --> CRON

    API --> FS
    API --> GENAI
    API --> SMTP
```

---

## 4. Firestore Data Model

All collections are accessed exclusively from the server via `firebase-admin`:

| Collection | Document Key | Purpose |
|---|---|---|
| `profiles` | Random unguessable string | Profile settings, timezone, notification emails, escalation config, and bcrypt passcode hashes. |
| `medications` | Auto-generated ID | Medication records (`name`, `dose`, `scheduleTimes`, `withFood`, `pillCount`, `active`). |
| `doseLog` | `${medId}_${YYYYMMDDHHmm}` | Immutable dose records (`taken`, `skipped`, `missed`) preventing double taps. |
| `appointments` | Auto-generated ID | Doctor visits, clinic location, ISO timestamp, reminder tracking flags. |
| `pendingChanges` | Auto-generated ID | Caretaker proposals (`status`: `pending`, `approved`, `rejected`, `cancelled`, `expired`). |
| `reminderLog` | `${refId}_${type}` | Idempotency locks ensuring notifications never double send; retries capped at 3. |
| `actionTokens` | SHA-256 hash of token | Single-use email action tokens tracked with `usedAt`. |
| `rateLimits` | SHA-256 hash of key | Failed login and API rate limiting counters (5 attempts → 15-minute lockout). |
| `auditLog` | Auto-generated ID | Strictly append-only audit trail with sensitive key sanitization. |
| `medicationExplanations` | Normalized drug name | Cached plain-language Gemini summaries. |
| `weeklyDigestLog` | `${profileId}_${YYYY_WW}` | Ensures weekly family digest executes strictly once per week. |

---

## 5. Environment Variables

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Minified Firebase service account JSON credentials string. |
| `GEMINI_API_KEY` | Google Gemini API key from Google AI Studio. |
| `GEMINI_MODEL` | Gemini model identifier (default: `gemini-2.5-flash`). |
| `SMTP_HOST` | Outbound SMTP server hostname (e.g. `smtp.gmail.com`). |
| `SMTP_PORT` | SMTP port (`587` for STARTTLS, `465` for SSL). |
| `SMTP_USER` | SMTP username or email address. |
| `SMTP_PASS` | SMTP password or App Password. |
| `SESSION_SECRET` | 32+ character random secret for signing `jose` HS256 cookies. |
| `CRON_SECRET` | 16+ character secret sent in `x-cron-secret` header by scheduler. |
| `TOKEN_SECRET` | 32+ character secret for signing one-tap email action JWTs. |
| `APP_URL` | Canonical public URL (e.g. `https://carecircle.vercel.app`). |

---

## 6. How Google Services are Used

1. **Cloud Firestore (Server-Side via `firebase-admin`):**
   - Serves as the central, real-time database.
   - Provides deterministic document locking (`reminderLog/${refId}_${type}`) to guarantee reminder idempotency.
   - Implements atomic multi-document transactions for Elder approvals, passcode rotation, dose logging, and single-use action tokens.
   - **Zero client-side Firebase SDK exposure** — zero database keys exposed to the browser.
2. **Google Gemini API (Official `@google/genai` SDK):**
   - **Natural-Language Prescription Parser:** Converts conversational user input into structured, validated JSON schedules (`parsedMedicationSchema`). User input is treated strictly as raw data with anti-prompt-injection system instructions.
   - **Empathetic Drug Explanations:** Explains medications at a 6th-grade reading level, with mandatory safety disclaimers appended in code.
   - **Weekly Digest Narrator:** Takes exact, pre-computed adherence statistics and writes warm, supportive family updates without inventing figures.

---

## 7. Local Development & Testing

### Installation
```bash
# Clone the repository
git clone https://github.com/your-org/carecircle.git
cd carecircle

# Install dependencies
npm install

# Configure local environment variables
cp .env.example .env.local

# Run the local development server
npm run dev
# Open http://localhost:3000
```

### Running Tests
```bash
# Run the entire test suite (84+ tests across 20 files)
npm test

# Run tests with code coverage report
npm run test:coverage

# Run automated axe accessibility checks
npx vitest run tests/accessibility.test.tsx
```

---

## 8. Vercel Deployment & Scheduler Setup

### Deploying to Vercel
1. Link your repository in Vercel:
   ```bash
   npm i -g vercel
   vercel link
   ```
2. Configure all 11 environment variables in the Vercel Dashboard (**Project Settings → Environment Variables**).
3. Deploy to production:
   ```bash
   vercel --prod
   ```

### External Scheduler Configuration (`cron-job.org`)
Because CareCircle uses serverless functions without `vercel.json` crons:
1. Create a new cron job at [cron-job.org](https://cron-job.org/).
2. **URL:** `https://your-app.vercel.app/api/cron/tick`
3. **HTTP Method:** `POST`
4. **Schedule:** Every 5 minutes (`*/5 * * * *`).
5. **Headers:**
   - Key: `x-cron-secret`
   - Value: `<YOUR_CRON_SECRET>`
6. **Timeout:** 30 seconds.

---

## 9. Security Model & Accessibility Notes

### Security Guarantees
- **Passcode Hashing:** Passcodes are hashed using `bcrypt` (cost 12) with a timing-safe constant-time dummy compare for missing profiles to eliminate user enumeration.
- **Signed Session Cookies:** Authenticated sessions use signed `jose` HS256 tokens in `__Host-` prefixed, `httpOnly`, `Secure`, `SameSite=Lax` cookies with an 8-hour expiry.
- **CSRF Protection:** State-mutating routes verify the `Origin` header against `APP_URL`.
- **Pre-Fetch Protection:** Email one-tap links use `GET` to display a confirmation card, and `POST` to execute the transaction, preventing mail security scanners from falsely triggering dose actions.
- **Rate Limiting:** Transactional 5-attempt / 15-minute lockout keyed by `profileId + IP`.
- **Strict Headers:** CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy.

### Accessibility (WCAG 2.1 AA Compliant)
- Base text size is **18px+** with 1.6 line height for seniors.
- Touch targets are minimum **48px x 48px** with generous padding.
- High color contrast meeting or exceeding 4.5:1 for body and 3:1 for large text.
- Visible high-contrast focus rings (`outline: 3px solid #2563eb`).
- Semantic HTML (`<main>`, `<header>`, `<article>`, `<label>`).
- Dynamic updates announced via `aria-live` polite regions.
- Skip-to-content keyboard link on every page.
- Motion preferences respected via `@media (prefers-reduced-motion: reduce)`.
- Verified with automated `axe-core` tests across all pages with **zero critical or serious violations**.

---

## 10. Known Limitations

- **Email Deliverability:** Rate limits and delivery speed depend on the configured SMTP provider (e.g. Gmail App Passwords permit up to 500 emails/day).
- **Informational AI Only:** Gemini medication explanations and schedules are for organizational support and do not constitute professional medical advice.
