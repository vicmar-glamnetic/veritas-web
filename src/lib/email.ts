import 'server-only';

import { Resend } from 'resend';

/**
 * Transactional email.
 *
 * Sending must never take the caller down with it. A booking that is saved but whose
 * confirmation email bounced is still a real booking — the patient has their reference
 * code on screen, and the front desk has the row. So every function here returns a
 * result instead of throwing, and the caller decides what to tell the patient.
 */
export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? 'Veritas Clinic <onboarding@resend.dev>';

const resend = apiKey ? new Resend(apiKey) : null;

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<SendResult> {
  if (!resend) {
    // Local development without a key: log it rather than failing the request.
    console.warn(`[email] RESEND_API_KEY not set — would have sent "${options.subject}" to ${options.to}`);
    return { ok: false, error: 'Email is not configured on this environment.' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      ...(options.html ? { html: options.html } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown email error' };
  }
}
