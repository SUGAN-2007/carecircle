/**
 * Escapes characters to prevent HTML injection in emails.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Base wrapper providing consistent high-contrast, large-font layout for emails.
 */
function wrapEmail(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 18px;
      line-height: 1.6;
      color: #1e293b;
      background-color: #f8fafc;
      margin: 0;
      padding: 24px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 2px solid #cbd5e1;
      border-radius: 16px;
      padding: 32px;
    }
    .header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .brand {
      font-size: 24px;
      font-weight: bold;
      color: #1d4ed8;
      margin: 0;
    }
    .title {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      margin: 16px 0 8px 0;
    }
    .highlight-box {
      background-color: #eff6ff;
      border-left: 6px solid #2563eb;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
      font-size: 20px;
      font-weight: bold;
    }
    .urgent-box {
      background-color: #fff1f2;
      border-left: 6px solid #e11d48;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
      font-size: 20px;
      font-weight: bold;
      color: #9f1239;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      margin-top: 32px;
      padding-top: 16px;
      font-size: 15px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">💊 CareCircle</div>
      <h1 class="title">${escapeHtml(title)}</h1>
    </div>
    ${bodyContent}
    <div class="footer">
      <p>CareCircle Healthcare Notifications · Sent with care to keep your family connected.</p>
    </div>
  </div>
</body>
</html>`;
}

export interface ActionUrls {
  takenUrl: string;
  snoozeUrl: string;
  skipUrl: string;
}

// ── 1. Upcoming Dose Template (15 min before) ─────────────────────────────────

export interface UpcomingDoseParams {
  elderName: string;
  medName: string;
  dose: string;
  timeSlot: string;
  withFood: boolean;
  actionUrls?: ActionUrls;
}

export function buildUpcomingDoseEmail(params: UpcomingDoseParams): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.elderName);
  const safeMed = escapeHtml(params.medName);
  const safeDose = escapeHtml(params.dose);
  const safeTime = escapeHtml(params.timeSlot);
  const foodNote = params.withFood
    ? '🍽️ Please take with food or a meal.'
    : '💧 Please take with a glass of water.';

  const subject = `Reminder: Medication due at ${params.timeSlot} — ${params.medName}`;

  let actionHtml = `
    <p>When you have taken your medication, please mark it as taken on your CareCircle Today screen.</p>
  `;

  let actionText = `When you have taken your medication, please mark it as taken on your CareCircle dashboard.`;

  if (params.actionUrls) {
    const { takenUrl, snoozeUrl, skipUrl } = params.actionUrls;
    actionHtml = `
      <p style="font-size: 19px; font-weight: bold; margin-top: 24px;">One-Tap Quick Actions:</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 16px 0; width: 100%;">
        <tr>
          <td style="padding-bottom: 12px;">
            <a href="${takenUrl}" style="display: block; background-color: #15803d; color: #ffffff; text-align: center; padding: 14px 20px; font-size: 18px; font-weight: bold; text-decoration: none; border-radius: 12px;">✔ Mark as Taken</a>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom: 12px;">
            <a href="${snoozeUrl}" style="display: block; background-color: #d97706; color: #ffffff; text-align: center; padding: 14px 20px; font-size: 18px; font-weight: bold; text-decoration: none; border-radius: 12px;">⏰ Snooze 15 Minutes</a>
          </td>
        </tr>
        <tr>
          <td>
            <a href="${skipUrl}" style="display: block; background-color: #475569; color: #ffffff; text-align: center; padding: 14px 20px; font-size: 18px; font-weight: bold; text-decoration: none; border-radius: 12px;">Skip Dose</a>
          </td>
        </tr>
      </table>
    `;

    actionText = `One-Tap Quick Actions:
- Mark as Taken: ${takenUrl}
- Snooze 15 Minutes: ${snoozeUrl}
- Skip Dose: ${skipUrl}`;
  }

  const bodyHtml = `
    <p>Hello ${safeName},</p>
    <p>This is a friendly reminder that your upcoming dose is due in about 15 minutes.</p>
    <div class="highlight-box">
      <div>💊 ${safeMed} (${safeDose})</div>
      <div>⏰ Due time: ${safeTime}</div>
    </div>
    <p><strong>Instructions:</strong> ${escapeHtml(foodNote)}</p>
    ${actionHtml}
  `;

  const text = `Hello ${params.elderName},

This is a friendly reminder that your upcoming dose is due in about 15 minutes:

Medication: ${params.medName} (${params.dose})
Due Time: ${params.timeSlot}
Instructions: ${foodNote}

${actionText}`;

  return {
    subject,
    html: wrapEmail(`Medication Due at ${params.timeSlot}`, bodyHtml),
    text,
  };
}

// ── 2. Missed Dose Template (30 min after) ────────────────────────────────────

export interface MissedDoseParams {
  elderName: string;
  medName: string;
  dose: string;
  scheduledSlot: string;
  actionUrls?: ActionUrls;
}

export function buildMissedDoseEmail(params: MissedDoseParams): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.elderName);
  const safeMed = escapeHtml(params.medName);
  const safeDose = escapeHtml(params.dose);
  const safeSlot = escapeHtml(params.scheduledSlot);

  const subject = `Urgent: Scheduled dose missed — ${params.medName} (${params.scheduledSlot})`;

  let actionHtml = `
    <p>Your scheduled medication dose was due 30 minutes ago and has not yet been marked as taken.</p>
    <p>If you have already taken it, please open your CareCircle Today screen and click <strong>"Taken"</strong> so your family and caretaker are kept informed.</p>
  `;

  let actionText = `Your scheduled medication was due 30 minutes ago and has not yet been logged. If you have already taken it, please mark it as taken on your CareCircle dashboard.`;

  if (params.actionUrls) {
    const { takenUrl, snoozeUrl, skipUrl } = params.actionUrls;
    actionHtml = `
      <p>Your scheduled medication dose was due 30 minutes ago and has not yet been marked as taken.</p>
      <p style="font-size: 19px; font-weight: bold; margin-top: 24px;">One-Tap Quick Actions:</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 16px 0; width: 100%;">
        <tr>
          <td style="padding-bottom: 12px;">
            <a href="${takenUrl}" style="display: block; background-color: #15803d; color: #ffffff; text-align: center; padding: 14px 20px; font-size: 18px; font-weight: bold; text-decoration: none; border-radius: 12px;">✔ Mark as Taken</a>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom: 12px;">
            <a href="${snoozeUrl}" style="display: block; background-color: #d97706; color: #ffffff; text-align: center; padding: 14px 20px; font-size: 18px; font-weight: bold; text-decoration: none; border-radius: 12px;">⏰ Snooze 15 Minutes</a>
          </td>
        </tr>
        <tr>
          <td>
            <a href="${skipUrl}" style="display: block; background-color: #475569; color: #ffffff; text-align: center; padding: 14px 20px; font-size: 18px; font-weight: bold; text-decoration: none; border-radius: 12px;">Skip Dose</a>
          </td>
        </tr>
      </table>
    `;

    actionText = `Your scheduled medication was due 30 minutes ago and has not yet been logged.

One-Tap Quick Actions:
- Mark as Taken: ${takenUrl}
- Snooze 15 Minutes: ${snoozeUrl}
- Skip Dose: ${skipUrl}`;
  }

  const bodyHtml = `
    <p>Hello ${safeName},</p>
    <div class="urgent-box">
      <div>⚠️ Missed Medication Alert</div>
      <div>${safeMed} — ${safeDose}</div>
      <div style="font-size: 16px; margin-top: 4px;">Scheduled for: ${safeSlot}</div>
    </div>
    ${actionHtml}
    <p>If you are unsure whether you took this dose, please consult your healthcare provider or packaging guidelines before taking an extra dose.</p>
  `;

  const text = `Hello ${params.elderName},

⚠️ MISSED MEDICATION ALERT
Medication: ${params.medName} (${params.dose})
Scheduled For: ${params.scheduledSlot}

${actionText}

If you are unsure whether you took this dose, consult your doctor or packaging instructions before taking an extra dose.`;

  return {
    subject,
    html: wrapEmail(`Missed Dose Alert: ${params.medName}`, bodyHtml),
    text,
  };
}

// ── 3. Appointment Reminder Template (Day before / 2h before) ─────────────────

export interface AppointmentReminderParams {
  elderName: string;
  doctor: string;
  place: string;
  dateTimeStr: string;
  reminderType: 'day_before' | 'two_hours_before';
  notes?: string;
}

export function buildAppointmentReminderEmail(params: AppointmentReminderParams): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.elderName);
  const safeDoc = escapeHtml(params.doctor);
  const safePlace = escapeHtml(params.place);
  const safeTime = escapeHtml(params.dateTimeStr);
  const safeNotes = params.notes ? escapeHtml(params.notes) : '';

  const is2h = params.reminderType === 'two_hours_before';
  const timeHeading = is2h ? 'In 2 Hours' : 'Tomorrow';
  const subject = `Appointment Reminder (${timeHeading}): ${params.doctor}`;

  const bodyHtml = `
    <p>Hello ${safeName},</p>
    <p>You have an upcoming medical appointment scheduled for <strong>${escapeHtml(timeHeading.toLowerCase())}</strong>.</p>
    <div class="highlight-box">
      <div>🩺 Doctor: ${safeDoc}</div>
      <div>📍 Location: ${safePlace}</div>
      <div>⏰ Time: ${safeTime}</div>
      ${safeNotes ? `<div style="font-size: 16px; margin-top: 8px;">Note: ${safeNotes}</div>` : ''}
    </div>
    <p>Please remember to bring your insurance card, photo ID, and a list of your current medications.</p>
  `;

  const text = `Hello ${params.elderName},

Upcoming Appointment Reminder (${timeHeading}):

Doctor: ${params.doctor}
Location: ${params.place}
Time: ${params.dateTimeStr}
${params.notes ? `Note: ${params.notes}\n` : ''}
Please remember to bring your identification and current medication list.`;

  return {
    subject,
    html: wrapEmail(`Appointment Reminder: ${params.doctor}`, bodyHtml),
    text,
  };
}
