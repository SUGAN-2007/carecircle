import { z } from 'zod';
import { getFirestore } from './firebase';
import { appendAuditLog } from './auditLog';

export interface Appointment {
  id: string;
  profileId: string;
  doctor: string;
  place: string;
  dateTime: string; // ISO 8601 string, e.g. "2026-11-20T10:30:00.000Z"
  notes?: string;
  reminderSent?: {
    dayBefore?: boolean;
    twoHoursBefore?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const createAppointmentSchema = z.object({
  doctor: z.string().trim().min(1, 'Doctor name is required').max(100),
  place: z.string().trim().min(1, 'Location or clinic is required').max(150),
  dateTime: z.string().datetime({ message: 'Must be a valid ISO 8601 date time' }),
  notes: z.string().trim().max(500).optional().default(''),
});

export const updateAppointmentSchema = createAppointmentSchema.partial();

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export async function createAppointment(
  profileId: string,
  input: CreateAppointmentInput,
  actor = 'elder',
): Promise<Appointment> {
  const db = getFirestore();
  const ref = db.collection('appointments').doc();
  const now = new Date();

  const appointment: Appointment = {
    id: ref.id,
    profileId,
    doctor: input.doctor,
    place: input.place,
    dateTime: input.dateTime,
    notes: input.notes || '',
    reminderSent: {
      dayBefore: false,
      twoHoursBefore: false,
    },
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(appointment);

  await appendAuditLog({
    profileId,
    actor,
    role: 'elder',
    action: 'appointment_created',
    payload: { appointmentId: ref.id, doctor: appointment.doctor, dateTime: appointment.dateTime },
  });

  return appointment;
}

export async function updateAppointment(
  profileId: string,
  appointmentId: string,
  updates: UpdateAppointmentInput,
  actor = 'elder',
): Promise<Appointment | null> {
  const db = getFirestore();
  const ref = db.collection('appointments').doc(appointmentId);
  const snap = await ref.get();

  if (!snap.exists) return null;
  const current = snap.data() as Appointment;
  if (current.profileId !== profileId) return null;

  const updateData: Partial<Appointment> = {
    ...updates,
    updatedAt: new Date(),
  };

  await ref.update(updateData);

  await appendAuditLog({
    profileId,
    actor,
    role: 'elder',
    action: 'appointment_updated',
    payload: { appointmentId, updates: updateData },
  });

  return { ...current, ...updateData };
}

export async function deleteAppointment(
  profileId: string,
  appointmentId: string,
  actor = 'elder',
): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection('appointments').doc(appointmentId);
  const snap = await ref.get();

  if (!snap.exists) return false;
  const appt = snap.data() as Appointment;
  if (appt.profileId !== profileId) return false;

  await ref.delete();

  await appendAuditLog({
    profileId,
    actor,
    role: 'elder',
    action: 'appointment_deleted',
    payload: { appointmentId, doctor: appt.doctor },
  });

  return true;
}

export async function getAppointments(profileId: string): Promise<Appointment[]> {
  const db = getFirestore();
  const snap = await db
    .collection('appointments')
    .where('profileId', '==', profileId)
    .get();

  const list = snap.docs.map((doc) => doc.data() as Appointment);
  // Sort chronologically
  list.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  return list;
}
