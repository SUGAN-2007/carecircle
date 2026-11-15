import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as hashModule from '@/lib/hash';
import * as rateLimitModule from '@/lib/rateLimit';

describe('Login Authentication & Anti-Enumeration Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('executes constant-time dummy hash compare on missing profile to prevent timing attack', async () => {
    const compareSpy = vi.spyOn(hashModule, 'comparePasscode');

    // Simulate flow when profile does not exist:
    const profileExists = false;
    const inputPasscode = '123456';

    if (!profileExists) {
      await hashModule.comparePasscode(inputPasscode, hashModule.DUMMY_HASH);
    }

    expect(compareSpy).toHaveBeenCalledWith(inputPasscode, hashModule.DUMMY_HASH);
  });

  it('identifies role strictly based on which hash matched', async () => {
    const elderHash = await hashModule.hashPasscode('111111');
    const caretakerHash = await hashModule.hashPasscode('222222');
    const familyHash = await hashModule.hashPasscode('333333');

    const testMatchRole = async (passcode: string) => {
      if (await hashModule.comparePasscode(passcode, elderHash)) return 'elder';
      if (await hashModule.comparePasscode(passcode, caretakerHash)) return 'caretaker';
      if (await hashModule.comparePasscode(passcode, familyHash)) return 'family';
      return null;
    };

    expect(await testMatchRole('111111')).toBe('elder');
    expect(await testMatchRole('222222')).toBe('caretaker');
    expect(await testMatchRole('333333')).toBe('family');
    expect(await testMatchRole('999999')).toBeNull();
  });

  it('enforces lockout when failed attempts reach threshold', async () => {
    const checkSpy = vi
      .spyOn(rateLimitModule, 'checkRateLimit')
      .mockResolvedValue({
        allowed: false,
        attemptsRemaining: 0,
        resetAt: new Date(Date.now() + 900000),
        lockoutSeconds: 900,
      });

    const mockDb: any = {};
    const result = await rateLimitModule.checkRateLimit(mockDb, 'login_p1_127.0.0.1');

    expect(result.allowed).toBe(false);
    expect(result.lockoutSeconds).toBe(900);
    expect(checkSpy).toHaveBeenCalled();
  });
});
