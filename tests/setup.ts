/**
 * Global Vitest setup.
 *
 * Runs once before the test suite.  Sets up environment stubs so modules
 * that call getEnv() do not throw during unit tests.
 *
 * Tests that need specific env values should override them locally with
 *   vi.stubEnv('KEY', 'value')
 * or use vi.mock('@/lib/env') to return a fixture object.
 */

import { vi } from 'vitest';

// Provide placeholder env vars so lib/env.ts validates without real secrets.
// Real network calls (Firestore, SMTP, Gemini) are always mocked in tests.
const TEST_ENV: Record<string, string> = {
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', project_id: 'test' }),
  GEMINI_API_KEY: 'test-gemini-key-00000000000000000000',
  SMTP_HOST: 'smtp.test.local',
  SMTP_PORT: '587',
  SMTP_USER: 'test@test.local',
  SMTP_PASS: 'test-smtp-pass',
  SESSION_SECRET: 'test-session-secret-at-least-32-chars-long!!',
  CRON_SECRET: 'test-cron-secret-min-16',
  TOKEN_SECRET: 'test-token-secret-at-least-32-chars-long!!',
  APP_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
