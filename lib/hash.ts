import bcrypt from 'bcryptjs';

/**
 * Standard bcrypt salt rounds for passcodes.
 * 12 rounds provides strong resistance to offline brute-force.
 */
const SALT_ROUNDS = 12;

/**
 * Pre-computed bcrypt hash of a random 16-character string with 12 rounds.
 * Used during failed login attempts when the profile code is not found,
 * ensuring constant-time execution and preventing account enumeration.
 */
export const DUMMY_HASH =
  '$2a$12$e8Yy8F41L/1c18vS0QdJ5.4E181h7Z5yQO9M8M/6W8kI0N7R2sWve';

/**
 * Hashes a plaintext passcode with bcrypt.
 */
export async function hashPasscode(passcode: string): Promise<string> {
  return bcrypt.hash(passcode, SALT_ROUNDS);
}

/**
 * Compares a plaintext passcode against a stored bcrypt hash.
 */
export async function comparePasscode(
  passcode: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(passcode, hash);
}
