import type { Role } from './session';
import { getFirestore } from './firebase';

export interface AuditLogEntry {
  profileId: string;
  actor: string; // e.g. "elder", "caretaker", "system", or IP address
  role: Role | 'system' | 'unauthenticated';
  action: string;
  payload?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Appends an immutable entry to the audit log collection in Firestore.
 * Never throws an unhandled error so it doesn't break primary user flows,
 * but logs to server stderr if Firestore fails.
 */
export async function appendAuditLog(
  entry: Omit<AuditLogEntry, 'timestamp'>,
): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection('auditLog').add({
      ...entry,
      payload: entry.payload ? sanitizePayload(entry.payload) : {},
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Failed to append audit log:', err);
  }
}

/**
 * Strips sensitive keys (like passcode, secret, token, key) from audit payloads.
 */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveRegex = /(passcode|hash|secret|token|password)/i;

  for (const [k, v] of Object.entries(payload)) {
    if (sensitiveRegex.test(k)) {
      sanitized[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      sanitized[k] = sanitizePayload(v as Record<string, unknown>);
    } else {
      sanitized[k] = v;
    }
  }

  return sanitized;
}
