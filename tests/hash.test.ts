import { describe, it, expect } from 'vitest';
import { hashPasscode, comparePasscode, DUMMY_HASH } from '@/lib/hash';

describe('Password & Hash Security Helpers', () => {
  it('hashes a passcode with bcrypt and validates correct match', async () => {
    const passcode = '123456';
    const hash = await hashPasscode(passcode);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(passcode);
    expect(hash.startsWith('$2a$12$')).toBe(true);

    const matches = await comparePasscode(passcode, hash);
    expect(matches).toBe(true);

    const wrong = await comparePasscode('654321', hash);
    expect(wrong).toBe(false);
  });

  it('provides a valid DUMMY_HASH to prevent timing attacks / account enumeration', async () => {
    expect(DUMMY_HASH).toBeDefined();
    expect(DUMMY_HASH.startsWith('$2a$12$')).toBe(true);

    // Should safely compare and return false without throwing
    const result = await comparePasscode('999999', DUMMY_HASH);
    expect(result).toBe(false);
  });
});
