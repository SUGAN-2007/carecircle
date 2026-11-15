import { z } from 'zod';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from './firebase';
import { appendAuditLog } from './auditLog';

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  dose: string; // e.g. "500mg" or "1 tablet"
  scheduleTimes: string[]; // HH:mm format, e.g. ["08:00", "20:00"]
  withFood: boolean;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  pillCount: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createMedicationSchema = z.object({
  name: z.string().trim().min(1, 'Medication name is required').max(100),
  dose: z.string().trim().min(1, 'Dose is required').max(50),
  scheduleTimes: z
    .array(z.string().regex(timeRegex, 'Time must be HH:mm format (e.g. 08:30)'))
    .min(1, 'At least one schedule time is required'),
  withFood: z.boolean().default(false),
  startDate: z
    .string()
    .regex(dateRegex, 'Start date must be YYYY-MM-DD format'),
  endDate: z
    .string()
    .regex(dateRegex, 'End date must be YYYY-MM-DD format')
    .nullable()
    .optional(),
  pillCount: z.number().int().min(0, 'Pill count cannot be negative').default(0),
});

export const updateMedicationSchema = createMedicationSchema.partial();

export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;
export type UpdateMedicationInput = z.infer<typeof updateMedicationSchema>;

/**
 * Creates a medication directly (used by Elder).
 */
export async function createMedication(
  profileId: string,
  input: CreateMedicationInput,
  actor = 'elder',
): Promise<Medication> {
  const db = getFirestore();
  const ref = db.collection('medications').doc();
  const now = new Date();

  const med: Medication = {
    id: ref.id,
    profileId,
    name: input.name,
    dose: input.dose,
    scheduleTimes: [...new Set(input.scheduleTimes)].sort(),
    withFood: input.withFood,
    startDate: input.startDate,
    endDate: input.endDate || null,
    pillCount: input.pillCount,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(med);

  await appendAuditLog({
    profileId,
    actor,
    role: 'elder',
    action: 'medication_created',
    payload: { medicationId: ref.id, name: med.name },
  });

  return med;
}

/**
 * Updates a medication directly (used by Elder).
 */
export async function updateMedication(
  profileId: string,
  medicationId: string,
  updates: UpdateMedicationInput,
  actor = 'elder',
): Promise<Medication | null> {
  const db = getFirestore();
  const ref = db.collection('medications').doc(medicationId);
  const snap = await ref.get();

  if (!snap.exists) return null;
  const current = snap.data() as Medication;
  if (current.profileId !== profileId) return null;

  const updateData: Partial<Medication> = {
    ...updates,
    updatedAt: new Date(),
  };

  if (updates.scheduleTimes) {
    updateData.scheduleTimes = [...new Set(updates.scheduleTimes)].sort();
  }

  await ref.update(updateData);

  await appendAuditLog({
    profileId,
    actor,
    role: 'elder',
    action: 'medication_updated',
    payload: { medicationId, updates: updateData },
  });

  return { ...current, ...updateData };
}

/**
 * Soft deletes a medication by setting active: false (used by Elder).
 * Preserves all historical dose logs.
 */
export async function softDeleteMedication(
  profileId: string,
  medicationId: string,
  actor = 'elder',
): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection('medications').doc(medicationId);
  const snap = await ref.get();

  if (!snap.exists) return false;
  const med = snap.data() as Medication;
  if (med.profileId !== profileId) return false;

  await ref.update({
    active: false,
    updatedAt: new Date(),
  });

  await appendAuditLog({
    profileId,
    actor,
    role: 'elder',
    action: 'medication_deleted',
    payload: { medicationId, name: med.name },
  });

  return true;
}

/**
 * Retrieves all active medications for a profile.
 */
export async function getActiveMedications(profileId: string): Promise<Medication[]> {
  const db = getFirestore();
  const snap = await db
    .collection('medications')
    .where('profileId', '==', profileId)
    .where('active', '==', true)
    .get();

  return snap.docs.map((doc) => doc.data() as Medication);
}

/**
 * Creates a pending proposal document when Caretaker submits a change.
 * Awaits Elder approval in Phase 5.
 */
export async function createPendingChange(
  profileId: string,
  type: 'medication_add' | 'medication_edit' | 'medication_delete' | 'appointment_add' | 'appointment_edit' | 'appointment_delete',
  payload: Record<string, unknown>,
  proposedBy = 'caretaker',
): Promise<string> {
  const db = getFirestore();
  const ref = db.collection('pendingChanges').doc();
  const now = new Date();

  await ref.set({
    id: ref.id,
    profileId,
    type,
    payload,
    proposedBy,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await appendAuditLog({
    profileId,
    actor: proposedBy,
    role: 'caretaker',
    action: 'change_proposed',
    payload: { type, pendingChangeId: ref.id },
  });

  return ref.id;
}
