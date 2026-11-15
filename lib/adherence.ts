import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { subDays } from 'date-fns';
import { getFirestore } from './firebase';
import { getActiveMedications } from './medications';
import { getDoseDocId, type DoseLog } from './doseLog';

export interface AdherenceStats {
  days: 7 | 30;
  rate: number; // 0 to 100 percentage
  taken: number;
  skipped: number;
  missed: number;
  totalDue: number;
}

/**
 * Calculates medication adherence rate over the last 7 or 30 days.
 *
 * Rules:
 * - Rate = taken / (taken + skipped + missed)
 * - Doses in the future are strictly excluded.
 * - Medication startDate and endDate boundaries are respected.
 * - Overdue scheduled doses with no recorded log count as missed.
 */
export async function calculateAdherence(
  profileId: string,
  days: 7 | 30 = 7,
  timezone = 'Asia/Kolkata',
  now = new Date(),
): Promise<AdherenceStats> {
  const db = getFirestore();
  const medications = await getActiveMedications(profileId);

  // Fetch all dose logs for this profile
  const doseSnap = await db
    .collection('doseLog')
    .where('profileId', '==', profileId)
    .get();

  const loggedMap = new Map<string, DoseLog>();
  for (const doc of doseSnap.docs) {
    loggedMap.set(doc.id, doc.data() as DoseLog);
  }

  let taken = 0;
  let skipped = 0;
  let missed = 0;

  // Generate date strings for the last N days up to today
  // index 0 = (now - (days - 1) days), ..., index days - 1 = today
  for (let i = days - 1; i >= 0; i--) {
    const dayDate = subDays(now, i);
    const dayStr = formatInTimeZone(dayDate, timezone, 'yyyy-MM-dd');

    for (const med of medications) {
      // Respect start and end dates
      if (dayStr < med.startDate) continue;
      if (med.endDate && dayStr > med.endDate) continue;

      for (const timeSlot of med.scheduleTimes) {
        const scheduledUtc = fromZonedTime(
          `${dayStr}T${timeSlot}:00`,
          timezone,
        );

        // Future doses do not count towards adherence
        if (scheduledUtc > now) continue;

        const slotStr = `${dayStr} ${timeSlot}`;
        const slotId = getDoseDocId(med.id, slotStr);
        const log = loggedMap.get(slotId);

        if (!log) {
          // Scheduled dose in the past with no entry = missed
          missed++;
        } else if (log.status === 'taken') {
          taken++;
        } else if (log.status === 'skipped') {
          skipped++;
        } else if (log.status === 'missed') {
          missed++;
        }
      }
    }
  }

  const totalDue = taken + skipped + missed;
  const rate = totalDue > 0 ? Math.round((taken / totalDue) * 100) : 100;

  return {
    days,
    rate,
    taken,
    skipped,
    missed,
    totalDue,
  };
}
