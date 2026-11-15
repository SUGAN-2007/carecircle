import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { getFirestore } from './firebase';
import { appendAuditLog } from './auditLog';
import { sendEmail } from './email';
import {
  buildUpcomingDoseEmail,
  buildMissedDoseEmail,
  buildAppointmentReminderEmail,
} from './emailTemplates';
import { createActionToken } from './actionToken';
import { getDoseDocId, type DoseLog } from './doseLog';
import { runEscalationPassForProfile } from './escalation';
import { processWeeklyDigestForProfile } from './weeklyDigest';
import type { Medication } from './medications';
import type { Appointment } from './appointments';

export interface ReminderLogDoc {
  id: string; // ${refId}_${type}
  refId: string;
  type: 'upcoming_15m' | 'missed_30m' | 'appt_day_before' | 'appt_2h_before';
  profileId: string;
  recipientEmail: string;
  status: 'sending' | 'sent' | 'failed' | 'permanently_failed';
  attempts: number;
  lastError?: string;
  createdAt: Date;
  sentAt?: Date;
  updatedAt: Date;
}

export interface TickResult {
  processed: number;
  sent: number;
  failed: number;
  missed: number;
}

/**
 * Attempts to acquire an atomic reservation in `reminderLog` for a deterministic key.
 * Prevents overlapping cron ticks or concurrent runners from double-sending.
 *
 * Returns:
 * - 'send': reservation acquired; proceed to send email.
 * - 'skip': already sent, currently in-flight, or exceeded 3 retry attempts.
 */
export async function acquireReminderLock(
  refId: string,
  type: ReminderLogDoc['type'],
  profileId: string,
  recipientEmail: string,
): Promise<{ action: 'send' | 'skip'; attempts: number }> {
  const db = getFirestore();
  const docId = `${refId}_${type}`;
  const ref = db.collection('reminderLog').doc(docId);
  const now = new Date();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists) {
      const data = snap.data() as ReminderLogDoc;
      if (data.status === 'sent') {
        return { action: 'skip', attempts: data.attempts };
      }
      if (data.status === 'permanently_failed' || (data.attempts || 0) >= 3) {
        return { action: 'skip', attempts: data.attempts };
      }
      if (data.status === 'sending') {
        // If locked in "sending" state for less than 5 minutes, assume concurrent worker
        const updatedMillis =
          data.updatedAt instanceof Date
            ? data.updatedAt.getTime()
            : typeof (data.updatedAt as any)?.toMillis === 'function'
            ? (data.updatedAt as any).toMillis()
            : Number(data.updatedAt) || 0;
        const lockAge = now.getTime() - updatedMillis;
        if (lockAge < 5 * 60 * 1000) {
          return { action: 'skip', attempts: data.attempts };
        }
      }

      // Eligible for retry
      const nextAttempts = (data.attempts || 0) + 1;
      tx.update(ref, {
        status: 'sending',
        attempts: nextAttempts,
        updatedAt: now,
      });
      return { action: 'send', attempts: nextAttempts };
    }

    // New lock reservation
    tx.set(ref, {
      id: docId,
      refId,
      type,
      profileId,
      recipientEmail,
      status: 'sending',
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { action: 'send', attempts: 1 };
  });
}

/**
 * Updates `reminderLog` status upon success or failure.
 */
export async function finalizeReminder(
  refId: string,
  type: ReminderLogDoc['type'],
  success: boolean,
  profileId: string,
  error?: unknown,
  attempts = 1,
): Promise<void> {
  const db = getFirestore();
  const docId = `${refId}_${type}`;
  const ref = db.collection('reminderLog').doc(docId);
  const now = new Date();

  try {
    if (success) {
      await ref.update({
        status: 'sent',
        sentAt: now,
        updatedAt: now,
      });
    } else {
      const isPermanent = attempts >= 3;
      await ref.update({
        status: isPermanent ? 'permanently_failed' : 'failed',
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: now,
      });

      if (isPermanent) {
        await appendAuditLog({
          profileId,
          actor: 'cron',
          role: 'system',
          action: 'reminder_permanently_failed',
          payload: { refId, type, attempts, error: String(error) },
        });
      }
    }
  } catch (err) {
    console.error(`Failed to finalize reminder ${docId}:`, err);
  }
}

/**
 * Automatically marks past doses as "missed" if they were scheduled > 30 minutes ago
 * and have no recorded doseLog entry.
 * Uses atomic create() to guarantee it NEVER overwrites a Taken or Skipped log.
 */
export async function markOverdueMissedDoses(
  profileId: string,
  medications: Medication[],
  timezone: string,
  now = new Date(),
): Promise<number> {
  const db = getFirestore();
  let markedCount = 0;

  // Window: scheduled between 30 minutes ago and 24 hours ago
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Check today and yesterday dates in profile timezone
  const todayStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const yesterdayStr = formatInTimeZone(oneDayAgo, timezone, 'yyyy-MM-dd');
  const candidateDays = [yesterdayStr, todayStr];

  for (const dayStr of candidateDays) {
    for (const med of medications) {
      if (!med.active) continue;
      if (dayStr < med.startDate) continue;
      if (med.endDate && dayStr > med.endDate) continue;

      for (const timeSlot of med.scheduleTimes) {
        const scheduledUtc = fromZonedTime(
          `${dayStr}T${timeSlot}:00`,
          timezone,
        );

        // Must be in the past by at least 30 minutes, but within last 24h
        if (scheduledUtc > thirtyMinsAgo || scheduledUtc < oneDayAgo) {
          continue;
        }

        const scheduledSlot = `${dayStr} ${timeSlot}`;
        const docId = getDoseDocId(med.id, scheduledSlot);
        const doseRef = db.collection('doseLog').doc(docId);

        try {
          // Transaction ensures we NEVER overwrite an existing taken/skipped record
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(doseRef);
            if (snap.exists) {
              return; // Already logged (taken, skipped, or previously marked missed)
            }

            const missedLog: DoseLog = {
              id: docId,
              profileId,
              medicationId: med.id,
              medicationName: med.name,
              scheduledAt: scheduledUtc.toISOString(),
              scheduledSlot,
              status: 'missed',
              loggedAt: now,
              loggedBy: 'cron',
              loggedByRole: 'elder', // Attributed to system cron on profile
            };

            tx.set(doseRef, missedLog);
            markedCount++;
          });
        } catch {
          // Atomic collision handled gracefully
        }
      }
    }
  }

  return markedCount;
}

/**
 * Main reminder tick routine called by /api/cron/tick.
 * Iterates profiles, marks missed doses, and dispatches due email notifications.
 */
export async function runReminderTick(now = new Date()): Promise<TickResult> {
  const db = getFirestore();
  const result: TickResult = { processed: 0, sent: 0, failed: 0, missed: 0 };

  // Fetch profiles in a bounded batch of 50
  const profilesSnap = await db.collection('profiles').limit(50).get();
  result.processed = profilesSnap.docs.length;

  for (const pDoc of profilesSnap.docs) {
    const profile = pDoc.data();
    const profileId = pDoc.id;
    const timezone = profile.timezone || 'Asia/Kolkata';
    const emailElder = profile.emailElder?.trim();
    const elderName = profile.name || 'CareCircle Member';

    if (!emailElder || !emailElder.includes('@')) {
      continue; // Skip profile if no valid elder email
    }

    // 1. Fetch active medications for this profile
    const medSnap = await db
      .collection('medications')
      .where('profileId', '==', profileId)
      .where('active', '==', true)
      .get();
    const medications = medSnap.docs.map((d) => d.data() as Medication);

    // 2. Mark missed doses (>30m overdue with no log)
    const newlyMissed = await markOverdueMissedDoses(
      profileId,
      medications,
      timezone,
      now,
    );
    result.missed += newlyMissed;

    // 3. Process Medication Doses (Upcoming & Missed)
    const todayStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');

    for (const med of medications) {
      if (!med.active) continue;
      if (todayStr < med.startDate) continue;
      if (med.endDate && todayStr > med.endDate) continue;

      for (const timeSlot of med.scheduleTimes) {
        const scheduledSlot = `${todayStr} ${timeSlot}`;
        const slotId = getDoseDocId(med.id, scheduledSlot);
        const scheduledUtc = fromZonedTime(
          `${todayStr}T${timeSlot}:00`,
          timezone,
        );

        const diffMinutes = (scheduledUtc.getTime() - now.getTime()) / (60 * 1000);

        // ── A. Upcoming Dose Reminder (15 min before) ────────────────────────
        // Window: scheduled in [0, 16] minutes from now
        if (diffMinutes >= 0 && diffMinutes <= 16) {
          // Check if already taken or skipped
          const doseDoc = await db.collection('doseLog').doc(slotId).get();
          const doseData = doseDoc.exists ? (doseDoc.data() as DoseLog) : undefined;
          if (doseData && (doseData.status === 'taken' || doseData.status === 'skipped')) {
            continue;
          }

          const lock = await acquireReminderLock(
            slotId,
            'upcoming_15m',
            profileId,
            emailElder,
          );

          if (lock.action === 'send') {
            let actionUrls;
            try {
              const [takenToken, snoozeToken, skipToken] = await Promise.all([
                createActionToken({ doseLogId: slotId, profileId, action: 'taken' }),
                createActionToken({ doseLogId: slotId, profileId, action: 'snooze' }),
                createActionToken({ doseLogId: slotId, profileId, action: 'skip' }),
              ]);
              actionUrls = {
                takenUrl: takenToken.url,
                snoozeUrl: snoozeToken.url,
                skipUrl: skipToken.url,
              };
            } catch {
              // Graceful fallback if token generation fails
            }

            const email = buildUpcomingDoseEmail({
              elderName,
              medName: med.name,
              dose: med.dose,
              timeSlot,
              withFood: med.withFood,
              actionUrls,
            });

            try {
              await sendEmail({
                to: emailElder,
                subject: email.subject,
                html: email.html,
                text: email.text,
              });
              await finalizeReminder(slotId, 'upcoming_15m', true, profileId);
              result.sent++;
            } catch (err) {
              await finalizeReminder(
                slotId,
                'upcoming_15m',
                false,
                profileId,
                err,
                lock.attempts,
              );
              result.failed++;
            }
          }
        }

        // ── B. Missed Dose Alert (30 min after) ───────────────────────────────
        // Window: scheduled between 30 and 46 minutes ago
        if (diffMinutes <= -30 && diffMinutes >= -46) {
          const doseDoc = await db.collection('doseLog').doc(slotId).get();
          const doseData = doseDoc.exists ? (doseDoc.data() as DoseLog) : undefined;

          // Only alert if still unlogged or marked missed (not taken/skipped)
          if (!doseData || doseData.status === 'missed') {
            const lock = await acquireReminderLock(
              slotId,
              'missed_30m',
              profileId,
              emailElder,
            );

            if (lock.action === 'send') {
              let actionUrls;
              try {
                const [takenToken, snoozeToken, skipToken] = await Promise.all([
                  createActionToken({ doseLogId: slotId, profileId, action: 'taken' }),
                  createActionToken({ doseLogId: slotId, profileId, action: 'snooze' }),
                  createActionToken({ doseLogId: slotId, profileId, action: 'skip' }),
                ]);
                actionUrls = {
                  takenUrl: takenToken.url,
                  snoozeUrl: snoozeToken.url,
                  skipUrl: skipToken.url,
                };
              } catch {
                // Graceful fallback
              }

              const email = buildMissedDoseEmail({
                elderName,
                medName: med.name,
                dose: med.dose,
                scheduledSlot,
                actionUrls,
              });

              try {
                await sendEmail({
                  to: emailElder,
                  subject: email.subject,
                  html: email.html,
                  text: email.text,
                });
                await finalizeReminder(slotId, 'missed_30m', true, profileId);
                result.sent++;
              } catch (err) {
                await finalizeReminder(
                  slotId,
                  'missed_30m',
                  false,
                  profileId,
                  err,
                  lock.attempts,
                );
                result.failed++;
              }
            }
          }
        }
      }
    }

    // 4. Run Escalation Ladder (Caretaker & Family alerts)
    try {
      const escResult = await runEscalationPassForProfile(
        profileId,
        profile,
        medications,
        now,
      );
      result.sent += escResult.caretakerEscalations + escResult.familyEscalations;
    } catch (err) {
      console.error(`Escalation ladder error for profile ${profileId}:`, err);
    }

    // 5. Process Appointments Reminders
    const apptSnap = await db
      .collection('appointments')
      .where('profileId', '==', profileId)
      .get();

    for (const aDoc of apptSnap.docs) {
      const appt = aDoc.data() as Appointment;
      const apptUtc = new Date(appt.dateTime);
      const diffHours = (apptUtc.getTime() - now.getTime()) / (60 * 60 * 1000);

      // ── Day before reminder (23h to 25h from now) ──────────────────────────
      if (diffHours >= 23 && diffHours <= 25) {
        const lock = await acquireReminderLock(
          appt.id,
          'appt_day_before',
          profileId,
          emailElder,
        );

        if (lock.action === 'send') {
          const email = buildAppointmentReminderEmail({
            elderName,
            doctor: appt.doctor,
            place: appt.place,
            dateTimeStr: new Date(appt.dateTime).toLocaleString('en-US', {
              timeZone: timezone,
              dateStyle: 'full',
              timeStyle: 'short',
            }),
            reminderType: 'day_before',
            notes: appt.notes,
          });

          try {
            await sendEmail({
              to: emailElder,
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
            await finalizeReminder(appt.id, 'appt_day_before', true, profileId);
            result.sent++;
          } catch (err) {
            await finalizeReminder(
              appt.id,
              'appt_day_before',
              false,
              profileId,
              err,
              lock.attempts,
            );
            result.failed++;
          }
        }
      }

      // ── 2 hours before reminder (1h50m to 2h10m from now) ──────────────────
      if (diffHours >= 1.83 && diffHours <= 2.17) {
        const lock = await acquireReminderLock(
          appt.id,
          'appt_2h_before',
          profileId,
          emailElder,
        );

        if (lock.action === 'send') {
          const email = buildAppointmentReminderEmail({
            elderName,
            doctor: appt.doctor,
            place: appt.place,
            dateTimeStr: new Date(appt.dateTime).toLocaleString('en-US', {
              timeZone: timezone,
              dateStyle: 'full',
              timeStyle: 'short',
            }),
            reminderType: 'two_hours_before',
            notes: appt.notes,
          });

          try {
            await sendEmail({
              to: emailElder,
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
            await finalizeReminder(appt.id, 'appt_2h_before', true, profileId);
            result.sent++;
          } catch (err) {
            await finalizeReminder(
              appt.id,
              'appt_2h_before',
              false,
              profileId,
              err,
              lock.attempts,
            );
            result.failed++;
          }
        }
      }
    }

    // 6. Process Weekly Family Digest (Sunday 18:00 local time)
    try {
      const digestRes = await processWeeklyDigestForProfile(
        profileId,
        profile,
        now,
      );
      if (digestRes.sent) {
        result.sent++;
      }
    } catch (err) {
      console.error(`Weekly digest error for profile ${profileId}:`, err);
    }
  }

  return result;
}
