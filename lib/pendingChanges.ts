import { z } from 'zod';
import { getFirestore } from './firebase';
import { appendAuditLog } from './auditLog';
import { sendEmail } from './email';
import { buildPendingProposalEmail } from './proposalEmail';
import {
  createMedicationSchema,
  updateMedicationSchema,
  type Medication,
} from './medications';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  type Appointment,
} from './appointments';

export type PendingChangeType =
  | 'medication_add'
  | 'medication_edit'
  | 'medication_delete'
  | 'appointment_add'
  | 'appointment_edit'
  | 'appointment_delete';

export type PendingChangeStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface PendingChange {
  id: string;
  profileId: string;
  type: PendingChangeType;
  payload: Record<string, unknown>;
  proposedBy: string;
  status: PendingChangeStatus;
  decidedAt?: Date;
  decidedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Checks whether a pending change has exceeded its 7-day expiration window.
 */
export function isChangeExpired(change: { createdAt: Date | { toMillis?: () => number } | number }): boolean {
  const createdTime =
    change.createdAt instanceof Date
      ? change.createdAt.getTime()
      : typeof (change.createdAt as any)?.toMillis === 'function'
      ? (change.createdAt as any).toMillis()
      : Number(change.createdAt) || 0;

  return Date.now() - createdTime > SEVEN_DAYS_MS;
}

/**
 * Creates a new pending proposal and sends a notification email to the Elder.
 */
export async function createPendingChange(
  profileId: string,
  type: PendingChangeType,
  payload: Record<string, unknown>,
  proposedBy = 'caretaker',
): Promise<string> {
  const db = getFirestore();
  const ref = db.collection('pendingChanges').doc();
  const now = new Date();

  const doc: PendingChange = {
    id: ref.id,
    profileId,
    type,
    payload,
    proposedBy,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(doc);

  await appendAuditLog({
    profileId,
    actor: proposedBy,
    role: 'caretaker',
    action: 'change_proposed',
    payload: { type, pendingChangeId: ref.id, details: payload },
  });

  // Notify Elder via email
  try {
    const profileDoc = await db.collection('profiles').doc(profileId).get();
    const profileData = profileDoc.data();
    const emailElder = profileData?.emailElder?.trim();

    if (emailElder && emailElder.includes('@')) {
      const lockRef = db.collection('reminderLog').doc(`${ref.id}_proposal_notify`);
      const lockSnap = await lockRef.get();

      if (!lockSnap.exists) {
        await lockRef.set({
          id: `${ref.id}_proposal_notify`,
          refId: ref.id,
          type: 'proposal_notify',
          profileId,
          recipientEmail: emailElder,
          status: 'sending',
          createdAt: now,
        });

        const desc = describeProposal(type, payload);
        const email = buildPendingProposalEmail({
          elderName: profileData?.name || 'CareCircle Member',
          type,
          description: desc,
          proposedBy,
        });

        await sendEmail({
          to: emailElder,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });

        await lockRef.update({ status: 'sent', sentAt: new Date() });
      }
    }
  } catch (err) {
    console.error('Failed to dispatch proposal notification email:', err);
  }

  return ref.id;
}

/**
 * Returns all pending proposals for a profile, evaluating 7-day expiration.
 */
export async function getPendingChanges(profileId: string): Promise<PendingChange[]> {
  const db = getFirestore();
  const snap = await db
    .collection('pendingChanges')
    .where('profileId', '==', profileId)
    .get();

  const list: PendingChange[] = [];

  for (const doc of snap.docs) {
    const item = doc.data() as PendingChange;

    // Check expiration on read
    if (item.status === 'pending' && isChangeExpired(item)) {
      item.status = 'expired';
      // Asynchronously update in background
      doc.ref.update({ status: 'expired', updatedAt: new Date() }).catch(() => {});
    }

    list.push(item);
  }

  // Sort descending by creation date
  list.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });

  return list;
}

/**
 * Atomically approves a pending proposal in a SINGLE Firestore transaction.
 * - Confirms status is strictly "pending".
 * - Verifies change has not expired (>7 days).
 * - Re-validates payload with Zod schema (never trusts stored data).
 * - Commits change to target collection (medications or appointments).
 * - Sets status "approved" with decidedAt and decidedBy.
 * - Writes audit log.
 * - Prevents double approvals.
 */
export async function approvePendingChange(
  profileId: string,
  changeId: string,
  actor = 'elder',
): Promise<{ success: boolean; appliedId?: string }> {
  const db = getFirestore();
  const changeRef = db.collection('pendingChanges').doc(changeId);
  const now = new Date();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(changeRef);
    if (!snap.exists) {
      throw new Error('Pending proposal not found');
    }

    const change = snap.data() as PendingChange;
    if (change.profileId !== profileId) {
      throw new Error('Unauthorized profile access');
    }

    if (change.status !== 'pending') {
      throw new Error(`Cannot approve proposal with status: ${change.status}`);
    }

    if (isChangeExpired(change)) {
      tx.update(changeRef, { status: 'expired', updatedAt: now });
      throw new Error('This proposal has expired (older than 7 days) and cannot be approved.');
    }

    let appliedId: string | undefined;

    // ── Re-validate and apply per proposal type ─────────────────────────────
    switch (change.type) {
      case 'medication_add': {
        const parsed = createMedicationSchema.safeParse(change.payload);
        if (!parsed.success) {
          throw new Error(`Payload validation failed: ${parsed.error.issues[0]?.message}`);
        }
        const medRef = db.collection('medications').doc();
        const newMed: Medication = {
          id: medRef.id,
          profileId,
          name: parsed.data.name,
          dose: parsed.data.dose,
          scheduleTimes: [...new Set(parsed.data.scheduleTimes)].sort(),
          withFood: parsed.data.withFood,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate || null,
          pillCount: parsed.data.pillCount,
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        tx.set(medRef, newMed);
        appliedId = medRef.id;
        break;
      }

      case 'medication_edit': {
        const idSchema = z.object({ medicationId: z.string().min(1) });
        const idParsed = idSchema.safeParse(change.payload);
        const updateParsed = updateMedicationSchema.safeParse(change.payload);
        if (!idParsed.success || !updateParsed.success) {
          throw new Error('Invalid medication edit payload');
        }
        const medRef = db.collection('medications').doc(idParsed.data.medicationId);
        const medSnap = await tx.get(medRef);
        if (!medSnap.exists) throw new Error('Target medication not found');

        const updateData: any = { ...updateParsed.data, updatedAt: now };
        if (updateParsed.data.scheduleTimes) {
          updateData.scheduleTimes = [...new Set(updateParsed.data.scheduleTimes)].sort();
        }
        tx.update(medRef, updateData);
        appliedId = idParsed.data.medicationId;
        break;
      }

      case 'medication_delete': {
        const idSchema = z.object({ medicationId: z.string().min(1) });
        const parsed = idSchema.safeParse(change.payload);
        if (!parsed.success) throw new Error('Invalid medication delete payload');

        const medRef = db.collection('medications').doc(parsed.data.medicationId);
        tx.update(medRef, { active: false, updatedAt: now });
        appliedId = parsed.data.medicationId;
        break;
      }

      case 'appointment_add': {
        const parsed = createAppointmentSchema.safeParse(change.payload);
        if (!parsed.success) {
          throw new Error(`Appointment validation failed: ${parsed.error.issues[0]?.message}`);
        }
        const apptRef = db.collection('appointments').doc();
        const newAppt: Appointment = {
          id: apptRef.id,
          profileId,
          doctor: parsed.data.doctor,
          place: parsed.data.place,
          dateTime: parsed.data.dateTime,
          notes: parsed.data.notes || '',
          reminderSent: { dayBefore: false, twoHoursBefore: false },
          createdAt: now,
          updatedAt: now,
        };
        tx.set(apptRef, newAppt);
        appliedId = apptRef.id;
        break;
      }

      case 'appointment_edit': {
        const idSchema = z.object({ appointmentId: z.string().min(1) });
        const idParsed = idSchema.safeParse(change.payload);
        const updateParsed = updateAppointmentSchema.safeParse(change.payload);
        if (!idParsed.success || !updateParsed.success) {
          throw new Error('Invalid appointment edit payload');
        }
        const apptRef = db.collection('appointments').doc(idParsed.data.appointmentId);
        tx.update(apptRef, { ...updateParsed.data, updatedAt: now });
        appliedId = idParsed.data.appointmentId;
        break;
      }

      case 'appointment_delete': {
        const idSchema = z.object({ appointmentId: z.string().min(1) });
        const parsed = idSchema.safeParse(change.payload);
        if (!parsed.success) throw new Error('Invalid appointment delete payload');

        const apptRef = db.collection('appointments').doc(parsed.data.appointmentId);
        tx.delete(apptRef);
        appliedId = parsed.data.appointmentId;
        break;
      }

      default:
        throw new Error('Unsupported proposal type');
    }

    // Mark approved
    tx.update(changeRef, {
      status: 'approved',
      decidedAt: now,
      decidedBy: actor,
      updatedAt: now,
    });

    await appendAuditLog({
      profileId,
      actor,
      role: 'elder',
      action: 'change_approved',
      payload: {
        changeId,
        type: change.type,
        appliedId,
      },
    });

    return { success: true, appliedId };
  });
}

/**
 * Rejects a pending proposal (Elder only).
 */
export async function rejectPendingChange(
  profileId: string,
  changeId: string,
  actor = 'elder',
  reason = '',
): Promise<boolean> {
  const db = getFirestore();
  const changeRef = db.collection('pendingChanges').doc(changeId);
  const now = new Date();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(changeRef);
    if (!snap.exists) throw new Error('Proposal not found');

    const change = snap.data() as PendingChange;
    if (change.profileId !== profileId) throw new Error('Unauthorized');
    if (change.status !== 'pending') {
      throw new Error(`Cannot reject proposal with status: ${change.status}`);
    }

    tx.update(changeRef, {
      status: 'rejected',
      rejectionReason: reason.trim(),
      decidedAt: now,
      decidedBy: actor,
      updatedAt: now,
    });

    await appendAuditLog({
      profileId,
      actor,
      role: 'elder',
      action: 'change_rejected',
      payload: { changeId, type: change.type, reason },
    });

    return true;
  });
}

/**
 * Cancels a pending proposal (Caretaker can cancel their own proposal).
 */
export async function cancelPendingChange(
  profileId: string,
  changeId: string,
  actor: string,
): Promise<boolean> {
  const db = getFirestore();
  const changeRef = db.collection('pendingChanges').doc(changeId);
  const now = new Date();

  const snap = await changeRef.get();
  if (!snap.exists) return false;

  const change = snap.data() as PendingChange;
  if (change.profileId !== profileId) return false;
  if (change.status !== 'pending') return false;

  await changeRef.update({
    status: 'cancelled',
    updatedAt: now,
  });

  await appendAuditLog({
    profileId,
    actor,
    role: 'caretaker',
    action: 'change_cancelled',
    payload: { changeId, type: change.type },
  });

  return true;
}

/**
 * Helper generating human-readable proposal summary.
 */
export function describeProposal(
  type: PendingChangeType,
  payload: Record<string, unknown>,
): string {
  switch (type) {
    case 'medication_add': {
      const times = Array.isArray(payload.scheduleTimes)
        ? payload.scheduleTimes.join(' & ')
        : '';
      return `Add medication ${payload.name} (${payload.dose}) at ${times}`;
    }
    case 'medication_edit': {
      return `Update medication details for ${payload.name || payload.medicationId}`;
    }
    case 'medication_delete': {
      return `Remove/deactivate medication`;
    }
    case 'appointment_add': {
      return `Schedule appointment with ${payload.doctor} at ${payload.place}`;
    }
    case 'appointment_edit': {
      return `Update appointment with ${payload.doctor || 'doctor'}`;
    }
    case 'appointment_delete': {
      return `Cancel scheduled appointment`;
    }
    default:
      return 'Healthcare schedule change';
  }
}
