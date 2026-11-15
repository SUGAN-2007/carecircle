import { formatInTimeZone } from 'date-fns-tz';
import { GoogleGenAI } from '@google/genai';
import { getFirestore } from './firebase';
import { getEnv } from './env';
import { sendEmail } from './email';
import { calculateAdherence, type AdherenceStats } from './adherence';
import { appendAuditLog } from './auditLog';
import { escapeHtml } from './emailTemplates';

export interface WeeklyDigestResult {
  profileId: string;
  sent: boolean;
  reason?: string;
  stats?: AdherenceStats;
}

/**
 * Generates an encouraging narrative from exact pre-computed numbers using Gemini,
 * with deterministic fallback if Gemini fails.
 */
export async function generateDigestNarrative(params: {
  elderName: string;
  stats: AdherenceStats;
}): Promise<string> {
  const { elderName, stats } = params;

  // Fallback template (deterministic)
  const fallback = `${elderName} achieved a ${stats.rate}% adherence rate over the last 7 days, successfully taking ${stats.taken} out of ${stats.totalDue} scheduled doses.`;

  try {
    const env = getEnv();
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';

    const prompt = `Elder Name: ${elderName}
Adherence Rate: ${stats.rate}%
Doses Taken: ${stats.taken}
Doses Skipped: ${stats.skipped}
Doses Missed: ${stats.missed}
Total Doses Scheduled: ${stats.totalDue}`;

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      config: {
        systemInstruction: `
You are an empathetic family health assistant for CareCircle.
Write a warm, 2-3 sentence weekly summary for the family based on the provided numbers.
CRITICAL CONSTRAINT: Do NOT invent, guess, modify, or add any numbers or statistics. Refer strictly to the exact numbers provided.
`,
        temperature: 0.3,
      },
    });

    const narrative = typeof response.text === 'string' ? response.text : '';
    return narrative.trim() || fallback;
  } catch (err) {
    console.warn('Gemini digest narrative fallback triggered:', err);
    return fallback;
  }
}

export function buildWeeklyDigestEmail(params: {
  elderName: string;
  stats: AdherenceStats;
  narrative: string;
  weekLabel: string;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(params.elderName);
  const safeWeek = escapeHtml(params.weekLabel);
  const safeNarrative = escapeHtml(params.narrative);

  const subject = `Weekly CareCircle Digest for ${params.elderName} — ${params.stats.rate}% Adherence (${params.weekLabel})`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 2px solid #cbd5e1; border-radius: 16px; padding: 32px;">
    <div style="font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 8px;">💊 CareCircle Weekly Family Digest</div>
    <div style="font-size: 16px; color: #64748b; margin-bottom: 24px;">Week: ${safeWeek}</div>

    <p style="font-size: 20px; font-weight: bold; color: #0f172a;">Hello Family,</p>
    <p>Here is how <strong>${safeName}</strong> managed their healthcare routines this past week:</p>

    <!-- Adherence Stat Box -->
    <div style="background-color: #eff6ff; border: 2px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
      <div style="font-size: 40px; font-weight: 900; color: #1d4ed8;">${params.stats.rate}%</div>
      <div style="font-size: 18px; font-weight: bold; color: #1e40af;">7-Day Medication Adherence</div>
      <div style="font-size: 16px; color: #3b82f6; margin-top: 8px;">
        ✔ ${params.stats.taken} Taken · ⚠️ ${params.stats.missed} Missed · ⏸️ ${params.stats.skipped} Skipped
      </div>
    </div>

    <!-- AI Narrative -->
    <div style="background-color: #f8fafc; border-left: 6px solid #2563eb; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 18px; color: #334155;">
      ${safeNarrative}
    </div>

    <p style="font-size: 16px; color: #64748b; margin-top: 24px;">
      Log in to your CareCircle family portal anytime to check active schedules and upcoming appointments.
    </p>

    <div style="margin-top: 32px; font-size: 14px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      Sent automatically by CareCircle to keep families connected and informed.
    </div>
  </div>
</body>
</html>`;

  const text = `CARECIRCLE WEEKLY FAMILY DIGEST — ${params.weekLabel}
Elder: ${params.elderName}

7-Day Adherence: ${params.stats.rate}%
Taken: ${params.stats.taken} | Missed: ${params.stats.missed} | Skipped: ${params.stats.skipped} | Total Due: ${params.stats.totalDue}

Summary:
${params.narrative}

View full details in the CareCircle app.`;

  return { subject, html, text };
}

/**
 * Dispatches weekly digest if today is Sunday evening in the profile's timezone
 * and a digest has not yet been dispatched for this profile and week.
 */
export async function processWeeklyDigestForProfile(
  profileId: string,
  profile: Record<string, any>,
  now = new Date(),
  force = false, // When testing or manual trigger
): Promise<WeeklyDigestResult> {
  const timezone = profile.timezone || 'Asia/Kolkata';

  // Check if today is Sunday (day of week: 0 in Date) and >= 18:00 local time
  const dayOfWeekStr = formatInTimeZone(now, timezone, 'i'); // 1 (Mon) to 7 (Sun)
  const hourStr = formatInTimeZone(now, timezone, 'HH');
  const hour = parseInt(hourStr, 10);

  if (!force) {
    const isSunday = dayOfWeekStr === '7';
    if (!isSunday || hour < 18) {
      return { profileId, sent: false, reason: 'Not Sunday evening' };
    }
  }

  const emailFamily = profile.emailFamily?.trim();
  const emailCaretaker = profile.emailCaretaker?.trim();
  const recipients = [emailFamily, emailCaretaker].filter(
    (e): e is string => Boolean(e && e.includes('@')),
  );

  if (recipients.length === 0) {
    return { profileId, sent: false, reason: 'No family or caretaker email configured' };
  }

  // Deterministic lock ID: ${profileId}_${YYYY_II}
  const weekLabel = formatInTimeZone(now, timezone, 'yyyy-wo');
  const weekKey = formatInTimeZone(now, timezone, 'yyyy_II');
  const lockId = `${profileId}_${weekKey}`;

  const db = getFirestore();
  const lockRef = db.collection('weeklyDigestLog').doc(lockId);

  // Single-execution reservation
  try {
    const alreadySent = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists && snap.data()?.status === 'sent') {
        return true;
      }
      tx.set(
        lockRef,
        {
          id: lockId,
          profileId,
          weekKey,
          status: 'sending',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      return false;
    });

    if (alreadySent) {
      return { profileId, sent: false, reason: 'Digest already sent for this week' };
    }
  } catch (err) {
    return { profileId, sent: false, reason: 'Lock acquisition collision' };
  }

  // 1. Calculate exact statistics in code
  const stats = await calculateAdherence(profileId, 7, timezone, now);
  const elderName = profile.name || 'CareCircle Member';

  // 2. Generate friendly narrative via Gemini (with fallback)
  const narrative = await generateDigestNarrative({ elderName, stats });

  // 3. Build email
  const email = buildWeeklyDigestEmail({
    elderName,
    stats,
    narrative,
    weekLabel,
  });

  // 4. Dispatch to family & caretaker
  try {
    for (const to of recipients) {
      await sendEmail({
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }

    await lockRef.update({
      status: 'sent',
      sentAt: new Date(),
      recipients,
      stats,
      updatedAt: new Date(),
    });

    await appendAuditLog({
      profileId,
      actor: 'cron_weekly_digest',
      role: 'system',
      action: 'weekly_digest_sent',
      payload: { weekKey, recipients, stats },
    });

    return { profileId, sent: true, stats };
  } catch (err) {
    await lockRef.update({
      status: 'failed',
      lastError: String(err),
      updatedAt: new Date(),
    });
    return { profileId, sent: false, reason: String(err) };
  }
}
