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
