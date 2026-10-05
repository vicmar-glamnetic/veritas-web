import { z } from 'zod';

import { phMobileSchema } from '@/lib/validation';

/** Every admin server action validates with one of these. The client is never trusted. */

const trimmed = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

/**
 * An HTML checkbox sends "on" when ticked and **nothing at all** when not, so the key is
 * absent from the form data entirely.
 *
 * `.optional()` is what makes an absent key valid. Listing `z.undefined()` inside the
 * union is not enough: the field is still required, and unticking any box produced
 * "expected nonoptional, received undefined" on every admin form.
 */
export const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.literal('')])
  .nullish()
  .transform((v) => v === 'on' || v === 'true');

const intFrom = (min: number, max: number, message: string) =>
  z.coerce.number().int().min(min, message).max(max, message);

export const doctorSchema = z.object({
  id: z.uuid().optional(),
  fullName: trimmed(2, 120, 'Enter the doctor’s name.'),
  specialty: trimmed(2, 120, 'Enter a specialty.'),
  bio: optionalText(1000),
  photoUrl: optionalText(500),
  sortOrder: intFrom(0, 999, 'Order must be between 0 and 999'),
  isActive: checkbox,
});

export const serviceSchema = z.object({
  id: z.uuid().optional(),
  name: trimmed(2, 200, 'Enter a name.'),
  category: z.enum(['consultation', 'laboratory', 'imaging']),
  // Kept as a string all the way to the numeric column; never through a float.
  pricePhp: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Price must be a number, for example 450 or 450.50'),
  durationMinutes: intFrom(1, 480, 'Duration must be between 1 and 480 minutes'),
  prepInstructions: optionalText(1000),
  sortOrder: intFrom(0, 9999, 'Order must be between 0 and 9999'),
  isBookableOnline: checkbox,
  isListedOnline: checkbox,
  isActive: checkbox,
});

export const sessionSchema = z
  .object({
    id: z.uuid().optional(),
    serviceCategory: z.enum(['consultation', 'laboratory', 'imaging']),
    doctorId: z
      .string()
      .trim()
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    dayOfWeek: intFrom(0, 6, 'Pick a day'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must look like 09:00'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must look like 12:00'),
    slotMinutes: intFrom(5, 240, 'Slot length must be between 5 and 240 minutes'),
    capacity: intFrom(1, 500, 'Capacity must be at least 1'),
    onlineCapacity: intFrom(0, 500, 'Online places cannot be negative'),
    bookingCutoffHours: intFrom(0, 336, 'Cut-off must be between 0 and 336 hours'),
    isActive: checkbox,
  })
  .refine((s) => s.endTime > s.startTime, {
    message: 'The session must end after it starts.',
    path: ['endTime'],
  })
  .refine((s) => s.onlineCapacity <= s.capacity, {
    message: 'Online places cannot exceed the total capacity.',
    path: ['onlineCapacity'],
  })
  .refine((s) => (s.serviceCategory === 'consultation') === Boolean(s.doctorId), {
    message: 'A consultation session needs a doctor; laboratory and imaging must not have one.',
    path: ['doctorId'],
  });

export const blackoutSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    target: z.string().trim(), // "" = whole clinic, "session:<id>", "doctor:<id>"
    reason: trimmed(3, 300, 'Give a reason, so staff know what to tell patients.'),
  })
  .transform((b) => {
    const [kind, id] = b.target.split(':');
    return {
      date: b.date,
      reason: b.reason,
      sessionId: kind === 'session' ? id : null,
      doctorId: kind === 'doctor' ? id : null,
    };
  });

export const promoSchema = z
  .object({
    id: z.uuid().optional(),
    title: trimmed(3, 200, 'Enter a title.'),
    body: trimmed(10, 2000, 'Say what the offer is.'),
    imageUrl: optionalText(500),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date'),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date'),
    sortOrder: intFrom(0, 999, 'Order must be between 0 and 999'),
    isActive: checkbox,
  })
  .refine((p) => p.endsOn >= p.startsOn, {
    message: 'The promo cannot end before it starts.',
    path: ['endsOn'],
  });

export const settingsSchema = z.object({
  clinicName: trimmed(2, 200, 'Enter the clinic name.'),
  address: trimmed(5, 500, 'Enter the address.'),
  phonePrimary: trimmed(5, 50, 'Enter a phone number.'),
  phoneSecondary: optionalText(50),
  email: z.string().trim().min(1, 'Enter an email address.').max(200).pipe(z.email('That email address does not look right.')),
  facebookUrl: optionalText(300),
  openingHoursText: trimmed(3, 1000, 'Enter the opening hours.'),
  mapEmbedUrl: optionalText(1000),
  bookingHorizonDays: intFrom(1, 180, 'The horizon must be between 1 and 180 days'),
});

/** A select whose blank option means "none". */
const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.uuid().nullable())
  .nullish()
  .transform((v) => v ?? null);

export const staffSchema = z
  .object({
    id: z.uuid().optional(),
    name: trimmed(2, 120, 'Enter a name.'),
    email: z.string().trim().toLowerCase().min(1, 'Enter an email address.').max(200).pipe(z.email('That email address does not look right.')),
    role: z.enum(['admin', 'reception', 'doctor', 'laboratory', 'imaging']),
    /** Only a doctor account carries one; the database enforces it too. */
    doctorId: optionalId,
    isActive: checkbox,
    // Blank on edit means "leave the password alone".
    password: z
      .string()
      .max(200)
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .refine((v) => v === null || v.length >= 10, {
        message: 'A password needs at least 10 characters.',
      }),
  })
  .refine((u) => u.role !== 'doctor' || u.doctorId !== null, {
    message: 'A doctor account needs to be linked to a doctor, so it knows whose patients to call.',
    path: ['doctorId'],
  })
  // Any other role drops the link rather than failing: the select still shows its old
  // value when someone changes a doctor's account to reception.
  .transform((u) => (u.role === 'doctor' ? u : { ...u, doctorId: null }));

export const roomSchema = z.object({
  id: z.uuid().optional(),
  name: trimmed(2, 80, 'Give the room a name, as the patients will see it on the screen.'),
  category: z.enum(['consultation', 'laboratory', 'imaging']),
  sortOrder: intFrom(0, 999, 'Order must be between 0 and 999'),
  isActive: checkbox,
});

/** Which room a station screen is working, and for a consultation room, whose line. */
export const stationSchema = z.object({
  roomId: z.uuid('Pick a room.'),
  doctorId: optionalId,
});

export const walkInSchema = z.object({
  fullName: trimmed(2, 120, 'Enter the patient’s name.'),
  mobile: phMobileSchema,
  category: z.enum(['consultation', 'laboratory', 'imaging']),
  /** Blank means the first doctor who is free. Ignored outside consultation. */
  doctorId: optionalId,
});
