import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  buildUpcomingDoseEmail,
  buildMissedDoseEmail,
  buildAppointmentReminderEmail,
} from '@/lib/emailTemplates';

describe('Email Templates & HTML Security', () => {
  it('correctly escapes dangerous HTML characters to prevent XSS in email clients', () => {
    const malicious = '<script>alert("xss")</script> & \'test\'';
    const escaped = escapeHtml(malicious);

    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#039;');
  });

  it('builds upcoming dose email with large accessible text and escaped fields', () => {
    const email = buildUpcomingDoseEmail({
      elderName: '<Margaret>',
      medName: 'Metformin & Glipizide',
      dose: '500mg',
      timeSlot: '08:00',
      withFood: true,
    });

    expect(email.subject).toContain('Metformin & Glipizide');
    expect(email.html).toContain('&lt;Margaret&gt;');
    expect(email.html).toContain('Metformin &amp; Glipizide');
    expect(email.html).toContain('Please take with food');
    expect(email.text).toContain('Margaret');
    expect(email.text).toContain('500mg');

    // Security check: never include passcodes or secret tokens
    expect(email.html).not.toMatch(/passcode|password|token|secret/i);
  });

  it('builds missed dose email with urgent notification styling', () => {
    const email = buildMissedDoseEmail({
      elderName: 'Margaret',
      medName: 'Lisinopril',
      dose: '10mg',
      scheduledSlot: '2026-11-15 08:00',
    });

    expect(email.subject).toContain('Urgent');
    expect(email.subject).toContain('Lisinopril');
    expect(email.html).toContain('Missed Medication Alert');
    expect(email.text).toContain('MISSED MEDICATION ALERT');
  });

  it('builds appointment reminder email for day_before and two_hours_before', () => {
    const dayBefore = buildAppointmentReminderEmail({
      elderName: 'Margaret',
      doctor: 'Dr. Sarah Connor',
      place: 'Memorial Cardiology',
      dateTimeStr: 'Monday, November 16, 2026 at 10:00 AM',
      reminderType: 'day_before',
      notes: 'Bring previous blood work',
    });

    expect(dayBefore.subject).toContain('Tomorrow');
    expect(dayBefore.html).toContain('Dr. Sarah Connor');
    expect(dayBefore.html).toContain('Bring previous blood work');

    const twoHoursBefore = buildAppointmentReminderEmail({
      elderName: 'Margaret',
      doctor: 'Dr. Sarah Connor',
      place: 'Memorial Cardiology',
      dateTimeStr: 'Today at 10:00 AM',
      reminderType: 'two_hours_before',
    });

    expect(twoHoursBefore.subject).toContain('In 2 Hours');
    expect(twoHoursBefore.text).toContain('In 2 Hours');
  });
});
