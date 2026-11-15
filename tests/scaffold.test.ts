/**
 * Smoke test — verifies the test runner and env setup work correctly.
 * Real feature tests are added per-phase starting from Phase 2.
 */
import { describe, it, expect } from 'vitest';

describe('Phase 1 scaffold', () => {
  it('test runner is configured correctly', () => {
    expect(1 + 1).toBe(2);
  });

  it('NODE_ENV is set to test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('placeholder env vars are present for test suite', () => {
    expect(process.env.SESSION_SECRET).toBeDefined();
    expect(process.env.SESSION_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(process.env.TOKEN_SECRET).toBeDefined();
    expect(process.env.CRON_SECRET).toBeDefined();
  });
});
