import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { getFirestore } from './firebase';
import { appendAuditLog } from './auditLog';
import { getActiveMedications, type Medication } from './medications';
import type { Role } from './session';

export type DoseStatus = 'taken' | 'skipped' | 'missed' | 'pending';

export interface DoseLog {
  id: string; // ${medicationId}_${YYYYMMDDHHmm}
  profileId: string;
  medicationId: string;
  medicationName: string;
  scheduledAt: string; // ISO 8601 UTC timestamp of scheduled time
  scheduledSlot: string; // YYYY-MM-DD HH:mm in profile timezone
  status: 'taken' | 'skipped' | 'missed';
  loggedAt: Date;
  loggedBy: string; // actor identifier
  loggedByRole: Role;
}

export interface TodayDoseItem {
  slotId: string; // deterministic ID: ${medicationId}_${YYYYMMDDHHmm}
  medicationId: string;
  medicationName: string;
  dose: string;
  withFood: boolean;
  pillCount: number;
  timeSlot: string; // "08:00"
  scheduledSlot: string; // "2026-11-15 08:00"
  scheduledAt: Date; // Date object in UTC
  status: DoseStatus;
  loggedAt?: Date;
  loggedByRole?: Role;
  canLog: boolean; // false if > 2h in the future
}

/**
 * Creates deterministic dose doc ID: ${medId}_${YYYYMMDDHHmm}
 */
export function getDoseDocId(medicationId: string, slotStr: string): string {
  // slotStr is expected as "YYYY-MM-DD HH:mm" or "YYYYMMDDHHmm"
  const clean = slotStr.replace(/[- :]/g, '').slice(0, 12);
  return `${medicationId}_${clean}`;
}

export interface LogDoseResult {
  success: boolean;
  status: 'taken' | 'skipped';
  alreadyLogged: boolean;
  pillCountRemaining?: number;
  error?: string;
}

/**
 * Logs a dose as Taken or Skipped in an atomic Firestore transaction.
 * - Idempotent: docId = ${medId}_${YYYYMMDDHHmm}.
 * - Verifies scheduled dose is not more than 2 hours in the future.
 * - Decrements medication pillCount on 'taken' (floor at 0).
 */
export async function logDose(params: {
  profileId: string;
  medicationId: string;
  scheduledSlot: string; // "YYYY-MM-DD HH:mm"
  timezone: string;
  status: 'taken' | 'skipped';
  loggedBy: string;
  loggedByRole: Role;
  now?: Date;
}): Promise<LogDoseResult> {
  const {
    profileId,
    medicationId,
    scheduledSlot,
    timezone,
    status,
    loggedBy,
    loggedByRole,
  } = params;

  const db = getFirestore();
  const currentTime = params.now || new Date();

  // Convert scheduledSlot string in profile timezone to a UTC Date
  let scheduledUtcDate: Date;
  try {
    scheduledUtcDate = fromZonedTime(
      `${scheduledSlot.replace(' ', 'T')}:00`,
      timezone,
    );
  } catch {
    return {
      success: false,
      status,
      alreadyLogged: false,
      error: 'Invalid scheduled slot format',
    };
  }

  // Reject if scheduled dose is more than 2 hours in the future
  const twoHoursFromNow = new Date(currentTime.getTime() + 2 * 60 * 60 * 1000);
  if (scheduledUtcDate > twoHoursFromNow) {
    return {
      success: false,
      status,
      alreadyLogged: false,
      error: 'Cannot log a dose more than 2 hours before its scheduled time',
    };
  }

  const docId = getDoseDocId(medicationId, scheduledSlot);
  const doseRef = db.collection('doseLog').doc(docId);
  const medRef = db.collection('medications').doc(medicationId);

  return db.runTransaction(async (tx) => {
    const [doseSnap, medSnap] = await Promise.all([
      tx.get(doseRef),
      tx.get(medRef),
    ]);

    if (!medSnap.exists) {
      throw new Error('Medication not found');
    }

    const medData = medSnap.data() as Medication;
    if (medData.profileId !== profileId) {
      throw new Error('Unauthorized medication access');
    }

    // Check idempotency: if already logged, return existing status
    if (doseSnap.exists) {
      const existing = doseSnap.data() as DoseLog;
      return {
        success: true,
        status: existing.status as 'taken' | 'skipped',
        alreadyLogged: true,
        pillCountRemaining: medData.pillCount,
      };
    }

    let updatedPillCount = medData.pillCount;
    if (status === 'taken' && updatedPillCount > 0) {
      updatedPillCount = Math.max(0, updatedPillCount - 1);
      tx.update(medRef, {
        pillCount: updatedPillCount,
        updatedAt: currentTime,
      });
    }

    const newLog: DoseLog = {
      id: docId,
      profileId,
      medicationId,
      medicationName: medData.name,
      scheduledAt: scheduledUtcDate.toISOString(),
      scheduledSlot,
      status,
      loggedAt: currentTime,
      loggedBy,
      loggedByRole,
    };

    tx.set(doseRef, newLog);

    await appendAuditLog({
      profileId,
      actor: loggedBy,
      role: loggedByRole,
      action: status === 'taken' ? 'dose_taken' : 'dose_skipped',
      payload: {
        medicationId,
        medicationName: medData.name,
        scheduledSlot,
        pillCountRemaining: updatedPillCount,
      },
    });

    return {
      success: true,
      status,
      alreadyLogged: false,
      pillCountRemaining: updatedPillCount,
    };
  });
}

/**
 * Constructs today's scheduled dose cards in the profile timezone,
 * merging active schedules with already recorded doseLogs.
 */
export async function getTodayDoses(
  profileId: string,
  timezone = 'Asia/Kolkata',
  now = new Date(),
): Promise<TodayDoseItem[]> {
  const db = getFirestore();
  const medications = await getActiveMedications(profileId);

  // Today's date string in profile timezone: "YYYY-MM-DD"
  const todayStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');

  // Fetch dose logs recorded for today in this profile
  const doseSnap = await db
    .collection('doseLog')
    .where('profileId', '==', profileId)
    .get();

  const loggedMap = new Map<string, DoseLog>();
  for (const doc of doseSnap.docs) {
    const log = doc.data() as DoseLog;
    if (log.scheduledSlot?.startsWith(todayStr)) {
      loggedMap.set(doc.id, log);
    }
  }

  const items: TodayDoseItem[] = [];
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  for (const med of medications) {
    // Check if today falls within medication start and end date
    if (todayStr < med.startDate) continue;
    if (med.endDate && todayStr > med.endDate) continue;

    for (const timeSlot of med.scheduleTimes) {
      const scheduledSlot = `${todayStr} ${timeSlot}`;
      const slotId = getDoseDocId(med.id, scheduledSlot);
      const scheduledUtcDate = fromZonedTime(
        `${todayStr}T${timeSlot}:00`,
        timezone,
      );

      const existingLog = loggedMap.get(slotId);
      const canLog = scheduledUtcDate <= twoHoursFromNow;

      items.push({
        slotId,
        medicationId: med.id,
        medicationName: med.name,
        dose: med.dose,
        withFood: med.withFood,
        pillCount: med.pillCount,
        timeSlot,
        scheduledSlot,
        scheduledAt: scheduledUtcDate,
        status: existingLog ? existingLog.status : 'pending',
        loggedAt: existingLog?.loggedAt,
        loggedByRole: existingLog?.loggedByRole,
        canLog,
      });
    }
  }

  // Sort chronologically by scheduled time
  items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return items;
}
