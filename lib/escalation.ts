import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { getFirestore } from './firebase';
import { sendEmail } from './email';
import { escapeHtml } from './emailTemplates';
import { getDoseDocId, type DoseLog } from './doseLog';
import type { Medication } from './medications';
import { acquireReminderLock, finalizeReminder } from './reminderEngine';
import { appendAuditLog } from './auditLog';

export interface EscalationConfig {
  enabled: boolean;
  elderMinutes: number; // default 30
  caretakerMinutes: number; // default 60
  familyMinutes: number; // default 120
}

export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  enabled: true,
  elderMinutes: 30,
  caretakerMinutes: 60,
  familyMinutes: 120,
};

export function buildCaretakerEscalationEmail(params: {
  elderName: string;
  medName: string;
  dose: string;
  scheduledSlot: string;
  minutesOverdue: number;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(params.elderName);
  const safeMed = escapeHtml(params.medName);
  const safeDose = escapeHtml(params.dose);
  const safeSlot = escapeHtml(params.scheduledSlot);

  const subject = `Caregiver Escalation: ${params.elderName}'s ${params.medName} is ${params.minutesOverdue}m overdue`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #cbd5e1; border-radius: 16px; padding: 32px;">
    <div style="font-size: 24px; font-weight: bold; color: #d97706; margin-bottom: 16px;">⚠️ Caregiver Escalation Alert</div>
    <p>Hello Caretaker,</p>
    <p><strong>${safeName}</strong> has not logged their scheduled medication, and the dose is now <strong>${params.minutesOverdue} minutes overdue</strong>.</p>
    <div style="background-color: #fef3c7; border-left: 6px solid #d97706; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 20px;">
      <div>💊 <strong>Medication:</strong> ${safeMed} (${safeDose})</div>
      <div>⏰ <strong>Scheduled:</strong> ${safeSlot}</div>
    </div>
    <p>Please check in with ${safeName} to confirm whether they need assistance taking their medication.</p>
    <div style="margin-top: 32px; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      CareCircle Automated Escalation Ladder
    </div>
  </div>
</body>
</html>`;

  const text = `CAREGIVER ESCALATION ALERT

Hello Caretaker,

${params.elderName} has not logged their scheduled medication, and the dose is now ${params.minutesOverdue} minutes overdue:

Medication: ${params.medName} (${params.dose})
Scheduled: ${params.scheduledSlot}

Please check in with ${params.elderName} to ensure they are safe and assist if necessary.`;

  return { subject, html, text };
}

export function buildFamilyEscalationEmail(params: {
  elderName: string;
  medName: string;
  dose: string;
  scheduledSlot: string;
  minutesOverdue: number;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(params.elderName);
  const safeMed = escapeHtml(params.medName);
  const safeDose = escapeHtml(params.dose);
  const safeSlot = escapeHtml(params.scheduledSlot);

  const subject = `Urgent Family Alert: ${params.elderName}'s ${params.medName} unconfirmed (${params.minutesOverdue}m)`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #ef4444; border-radius: 16px; padding: 32px;">
    <div style="font-size: 24px; font-weight: bold; color: #dc2626; margin-bottom: 16px;">🚨 Family Health Notice</div>
    <p>Hello Family,</p>
    <p>This is a health notice concerning <strong>${safeName}</strong>. A scheduled medication dose remains unconfirmed <strong>${params.minutesOverdue} minutes</strong> past its scheduled time.</p>
    <div style="background-color: #fee2e2; border-left: 6px solid #dc2626; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 20px;">
      <div>💊 <strong>Medication:</strong> ${safeMed} (${safeDose})</div>
      <div>⏰ <strong>Scheduled:</strong> ${safeSlot}</div>
    </div>
    <p>Please call or reach out to ${safeName} or their caregiver to ensure everything is okay.</p>
    <div style="margin-top: 32px; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      CareCircle Automated Escalation Ladder
    </div>
  </div>
</body>
</html>`;

  const text = `URGENT FAMILY HEALTH NOTICE

Hello Family,

A scheduled medication dose for ${params.elderName} remains unconfirmed ${params.minutesOverdue} minutes after its scheduled time:

Medication: ${params.medName} (${params.dose})
Scheduled: ${params.scheduledSlot}

Please reach out to ${params.elderName} or their caregiver to check in.`;

  return { subject, html, text };
}

/**
 * Executes the escalation ladder for a single profile.
 * - Idempotent via deterministic reminderLog IDs.
 * - STOPS escalating if dose has been logged as 'taken' or 'skipped'.
 */
export async function runEscalationPassForProfile(
  profileId: string,
  profile: Record<string, any>,
  medications: Medication[],
  now = new Date(),
): Promise<{ caretakerEscalations: number; familyEscalations: number }> {
  const config: EscalationConfig = {
    ...DEFAULT_ESCALATION_CONFIG,
    ...(profile.escalation || {}),
  };

  // If escalation is turned off for this profile, skip completely
  if (!config.enabled) {
    return { caretakerEscalations: 0, familyEscalations: 0 };
  }

  const db = getFirestore();
  const timezone = profile.timezone || 'Asia/Kolkata';
  const elderName = profile.name || 'CareCircle Member';
  const emailCaretaker = profile.emailCaretaker?.trim();
  const emailFamily = profile.emailFamily?.trim();

  let caretakerCount = 0;
  let familyCount = 0;

  const todayStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');

  for (const med of medications) {
    if (!med.active) continue;
    if (todayStr < med.startDate) continue;
    if (med.endDate && todayStr > med.endDate) continue;

    for (const timeSlot of med.scheduleTimes) {
      const scheduledSlot = `${todayStr} ${timeSlot}`;
      const slotId = getDoseDocId(med.id, scheduledSlot);
      const scheduledUtc = fromZonedTime(`${todayStr}T${timeSlot}:00`, timezone);

      const diffMinutes = Math.floor(
        (now.getTime() - scheduledUtc.getTime()) / (60 * 1000),
      );

      // Must be overdue in the past
      if (diffMinutes < config.caretakerMinutes) continue;

      // ── STOP-ON-LOGGED CHECK ────────────────────────────────────────────────
      // Check doseLog status: if 'taken' or 'skipped', STOP escalating immediately!
      const doseDoc = await db.collection('doseLog').doc(slotId).get();
      if (doseDoc.exists) {
        const doseData = doseDoc.data() as DoseLog;
        if (doseData.status === 'taken' || doseData.status === 'skipped') {
          continue; // Dose is taken or skipped. Do not escalate!
        }
      }

      // 1. Caretaker Escalation Tier
      if (
        diffMinutes >= config.caretakerMinutes &&
        emailCaretaker &&
        emailCaretaker.includes('@')
      ) {
        const lock = await acquireReminderLock(
          slotId,
          'escalate_caretaker' as any,
          profileId,
          emailCaretaker,
        );

        if (lock.action === 'send') {
          const email = buildCaretakerEscalationEmail({
            elderName,
            medName: med.name,
            dose: med.dose,
            scheduledSlot,
            minutesOverdue: diffMinutes,
          });

          try {
            await sendEmail({
              to: emailCaretaker,
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
            await finalizeReminder(
              slotId,
              'escalate_caretaker' as any,
              true,
              profileId,
            );
            caretakerCount++;
            await appendAuditLog({
              profileId,
              actor: 'cron_escalation',
              role: 'system',
              action: 'escalation_sent_caretaker',
              payload: { slotId, minutesOverdue: diffMinutes },
            });
          } catch (err) {
            await finalizeReminder(
              slotId,
              'escalate_caretaker' as any,
              false,
              profileId,
              err,
              lock.attempts,
            );
          }
        }
      }

      // 2. Family Escalation Tier
      if (
        diffMinutes >= config.familyMinutes &&
        emailFamily &&
        emailFamily.includes('@')
      ) {
        const lock = await acquireReminderLock(
          slotId,
          'escalate_family' as any,
          profileId,
          emailFamily,
        );

        if (lock.action === 'send') {
          const email = buildFamilyEscalationEmail({
            elderName,
            medName: med.name,
            dose: med.dose,
            scheduledSlot,
            minutesOverdue: diffMinutes,
          });

          try {
            await sendEmail({
              to: emailFamily,
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
            await finalizeReminder(
              slotId,
              'escalate_family' as any,
              true,
              profileId,
            );
            familyCount++;
            await appendAuditLog({
              profileId,
              actor: 'cron_escalation',
              role: 'system',
              action: 'escalation_sent_family',
              payload: { slotId, minutesOverdue: diffMinutes },
            });
          } catch (err) {
            await finalizeReminder(
              slotId,
              'escalate_family' as any,
              false,
              profileId,
              err,
              lock.attempts,
            );
          }
        }
      }
    }
  }

  return { caretakerEscalations: caretakerCount, familyEscalations: familyCount };
}
