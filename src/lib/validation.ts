import { z } from 'zod';

import { normalizeMobile } from './mobile';

/**
 * Every server action validates its input with one of these. The client may enforce the
 * same rules for a nicer experience, but the client is never trusted.
 */

/** Trims, and turns an empty string into undefined so `.optional()` behaves. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

export const phMobileSchema = z
  .string()
  .trim()
  .min(1, 'Please enter your mobile number.')
  .transform((value, ctx) => {
    const normalized = normalizeMobile(value);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'That does not look like a Philippine mobile number. Try it like 0917 123 4567.',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const inquirySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Please put your name in.')
    .max(120, 'That name is longer than we can store.'),
  email: z
    .string()
    .trim()
    .min(1, 'We need an email address to reply to.')
    .max(200)
    .pipe(z.email('That email address does not look right.')),
  mobile: optionalText(30),
  message: z
    .string()
    .trim()
    .min(10, 'Could you say a little more than that?')
    .max(2000, 'That is longer than we can take. Please trim it to 2000 characters.'),
  /** Honeypot: a field no human sees. Bots fill it in. */
  website: z.string().max(0).optional(),
});

export type InquiryInput = z.infer<typeof inquirySchema>;

/* -------------------------------------------------------------------------- */
/* Booking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Step 3 of the booking form. The service, doctor, session and slot come from hidden
 * fields carried through the earlier steps; they are re-checked against the database in
 * the server action, because a hidden field is just a suggestion from the browser.
 */
export const createBookingSchema = z.object({
  serviceId: z.uuid('Please choose a service.'),
  doctorId: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .pipe(z.uuid('Please choose a doctor.').optional()),
  sessionId: z.uuid('Please choose a time.'),
  /** ISO instant of the slot. */
  start: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Please choose a time.')
    .transform((v) => new Date(v)),
  fullName: z
    .string()
    .trim()
    .min(2, 'Please put your full name in.')
    .max(120, 'That name is longer than we can store.'),
  mobile: phMobileSchema,
  email: z
    .string()
    .trim()
    .min(1, 'We need an email address to send your confirmation to.')
    .max(200)
    .pipe(z.email('That email address does not look right.')),
  notes: optionalText(500),
  /** The Data Privacy Act consent tick. The form cannot be submitted without it. */
  consent: z
    .string()
    .optional()
    .refine((v) => v === 'on' || v === 'true', 'Please tick the box to continue.'),
  /** Honeypot. */
  website: z.string().max(0).optional(),
});

export type CreateBookingInputRaw = z.infer<typeof createBookingSchema>;

/** Looking up your own booking: reference code plus the mobile you booked with. */
export const bookingLookupSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(4, 'Please enter your reference code.')
    .max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  mobile: phMobileSchema,
});
