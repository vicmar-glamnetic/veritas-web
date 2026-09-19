'use server';

import { sendEmail } from '@/lib/email';
import { checkRateLimit, clientIp, pruneRateLimits } from '@/lib/rate-limit';
import { getSiteSettings } from '@/lib/queries';
import { inquirySchema } from '@/lib/validation';

export type InquiryState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
};

const MAX_INQUIRIES_PER_HOUR = 5;

export async function submitInquiry(
  _previous: InquiryState,
  formData: FormData,
): Promise<InquiryState> {
  const parsed = inquirySchema.safeParse({
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
    mobile: formData.get('mobile') ?? '',
    message: formData.get('message') ?? '',
    website: formData.get('website') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '');
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return {
      status: 'error',
      message: 'Almost there. Please check the fields marked below.',
      fieldErrors,
    };
  }

  // A bot filled the hidden field. Look successful so it does not retry.
  if (parsed.data.website) {
    return { status: 'success', message: 'Thank you, your message has been sent.' };
  }

  const ip = await clientIp();
  const limit = await checkRateLimit(`inquiry:${ip}`, MAX_INQUIRIES_PER_HOUR, 3600);
  if (!limit.ok) {
    return {
      status: 'error',
      message:
        'That is a few messages in a short time. Please wait a little while before sending another, or ring the clinic if it cannot wait.',
    };
  }
  void pruneRateLimits();

  const settings = await getSiteSettings();
  const inbox = process.env.CLINIC_INBOX ?? settings.email;

  if (!inbox) {
    return {
      status: 'error',
      message: 'Something is wrong with our mail setup. Please ring the clinic instead.',
    };
  }

  const { name, email, mobile, message } = parsed.data;

  const result = await sendEmail({
    to: inbox,
    replyTo: email,
    subject: `Website inquiry from ${name}`,
    text: [
      'A message was sent through the website inquiry form.',
      '',
      `Name:    ${name}`,
      `Email:   ${email}`,
      `Mobile:  ${mobile ?? '(not given)'}`,
      '',
      'Message:',
      message,
      '',
      '— Reply to this email to answer the sender directly.',
    ].join('\n'),
  });

  if (!result.ok) {
    console.error('[inquiry] email failed:', result.error);
    return {
      status: 'error',
      message:
        'Sorry, we could not get that through just now. Please ring us or send a message on Facebook instead.',
    };
  }

  return {
    status: 'success',
    message: 'Thank you. It has landed at the front desk and we will reply as soon as we can.',
  };
}
