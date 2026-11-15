# Project Rules

- Stack: Next.js (App Router, TypeScript) on Vercel, Firestore via firebase-admin (server-side only), Gemini API, Nodemailer (SMTP).
- No Docker. No separate backend server. API routes live in the same Next.js app.
- Never commit secrets. Use environment variables only, and keep .env.example up to date.
- Validate all API input with zod. Never trust client-sent role or profile IDs; derive them from the signed session cookie.
- Keep functions small, typed, and commented where non-obvious. Prefer simple over clever.
- Every feature needs at least one unit test (Vitest).
- All UI must meet WCAG AA: semantic HTML, labels, visible focus, 18px+ base text, high contrast, keyboard operable.
- Plan first. Wait for my approval after each phase before starting the next.
