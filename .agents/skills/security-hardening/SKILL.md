---
name: security-hardening
description: Reviews and hardens auth, API routes, tokens and secrets. Use when writing or reviewing login, passcode, session, cron or email-link code.
---

## Goal
Make sure auth and API code is safe before it ships.

## Checklist
- Passcodes hashed with bcrypt; never logged or returned.
- Role and profile ID come from the signed session, never from the request body.
- Every route validates input with zod and checks the caller's role.
- Failed logins are rate limited; cron route requires CRON_SECRET.
- Email-action tokens are signed, expiring and single use.
- No secrets in code or the repo; .env.example lists every variable.

## Constraints
Do not weaken a check to make a test pass.
