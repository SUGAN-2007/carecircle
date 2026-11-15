import { describe, it, expect } from 'vitest';
import {
  signSession,
  verifySessionToken,
  type SessionPayload,
} from '@/lib/session';

describe('Session Cryptographic Tokens (jose HS256)', () => {
  const validPayload: SessionPayload = {
    profileId: 'profile-123',
    role: 'elder',
    sessionVersion: 1,
  };

  it('signs and verifies a valid session payload', async () => {
    const token = await signSession(validPayload);
    expect(typeof token).toBe('string');

    const decoded = await verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.profileId).toBe('profile-123');
    expect(decoded?.role).toBe('elder');
    expect(decoded?.sessionVersion).toBe(1);
  });

  it('rejects tampered tokens', async () => {
    const token = await signSession(validPayload);
    // Tamper with the signature portion of the JWT (last segment)
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.badsignature`;

    const result = await verifySessionToken(tampered);
    expect(result).toBeNull();
  });

  it('rejects expired tokens', async () => {
    // Generate a token that expired 10 seconds ago
    const expiredToken = await signSession(validPayload, -10);
    const result = await verifySessionToken(expiredToken);
    expect(result).toBeNull();
  });

  it('rejects tokens with invalid or unsupported roles', async () => {
    // Manually pass an invalid role
    const invalidRolePayload = {
      profileId: 'profile-123',
      role: 'admin' as any,
      sessionVersion: 1,
    };
    const token = await signSession(invalidRolePayload);
    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });
});
