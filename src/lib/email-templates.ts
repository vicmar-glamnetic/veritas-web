import { formatManilaDate, formatManilaTime } from './time';
import { formatMobile } from './mobile';
import { absoluteUrl } from './site';

/**
 * The booking confirmation.
 *
 * Sent as both plain text and HTML. The plain text matters more than usual here: a lot
 * of patients read this in the Gmail app on a cheap phone, and some mail clients on
 * older Android builds render HTML badly or not at all.
 *
 * The reference code leads, because it is the one thing the patient needs at the desk.
 */

export type ConfirmationEmailInput = {
  referenceCode: string;
  cancelToken: string;
  patientName: string;
  serviceName: string;
  doctorName: string | null;
  start: Date;
  prepInstructions: string | null;
  clinic: {
    name: string;
    address: string;
    phonePrimary: string;
    phoneSecondary: string | null;
  };
};

export function confirmationSubject(input: ConfirmationEmailInput): string {
  // Leads with when, because that is what someone scans an inbox for. The reference
  // code trails so it is still visible in the preview line on a phone.
  return `Your appointment on ${formatManilaDate(input.start)} at ${formatManilaTime(
    input.start,
  )} (${input.referenceCode})`;
}

export function confirmationText(input: ConfirmationEmailInput): string {
  const cancelUrl = absoluteUrl(`/booking/cancel/${input.cancelToken}`);
  const phones = [input.clinic.phonePrimary, input.clinic.phoneSecondary]
    .filter(Boolean)
    .join(' or ');

  const lines = [
    `Hello ${input.patientName},`,
    '',
    `Your appointment at ${input.clinic.name} is booked.`,
    '',
    `REFERENCE CODE: ${input.referenceCode}`,
    'Please give this code at the front desk when you arrive.',
    '',
    `What:  ${input.serviceName}`,
    ...(input.doctorName ? [`Who:   ${input.doctorName}`] : []),
    `When:  ${formatManilaDate(input.start)} at ${formatManilaTime(input.start)}`,
    `Where: ${input.clinic.address}`,
    '',
  ];

  if (input.prepInstructions) {
    lines.push('BEFORE YOU COME', input.prepInstructions, '');
  }

  lines.push(
    'A few things worth knowing:',
    '  - There is nothing to pay online. You pay at the clinic.',
    '  - Please arrive about 10 minutes early.',
    '  - Bring a valid ID. Senior citizens and persons with disability should bring',
    '    their booklet or ID for the 20% discount the law provides.',
    '',
    'CANNOT MAKE IT?',
    'Please cancel so we can give the slot to someone else:',
    cancelUrl,
    '',
    `Or ring us on ${phones}.`,
    '',
    `${input.clinic.name}`,
    input.clinic.address,
    phones,
  );

  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function confirmationHtml(input: ConfirmationEmailInput): string {
  const cancelUrl = absoluteUrl(`/booking/cancel/${input.cancelToken}`);
  const phones = [input.clinic.phonePrimary, input.clinic.phoneSecondary]
    .filter(Boolean)
    .join(' or ');
  const e = escapeHtml;

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 16px 6px 0;color:#5e726f;font-size:14px;vertical-align:top;white-space:nowrap;">${e(label)}</td>
      <td style="padding:6px 0;color:#10211f;font-size:15px;font-weight:600;">${e(value)}</td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f7f6;">
  <div style="display:none;max-height:0;overflow:hidden;">Reference ${e(input.referenceCode)} — ${e(formatManilaDate(input.start))} at ${e(formatManilaTime(input.start))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe6e3;border-radius:12px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
        <tr><td style="padding:24px 24px 8px;">
          <p style="margin:0;color:#0e6058;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${e(input.clinic.name)}</p>
          <h1 style="margin:10px 0 0;color:#10211f;font-size:22px;line-height:1.3;">Your appointment is booked</h1>
          <p style="margin:10px 0 0;color:#294340;font-size:15px;line-height:1.6;">Hello ${e(input.patientName)}, here are the details. Please show the reference code at the front desk.</p>
        </td></tr>

        <tr><td style="padding:16px 24px 0;">
          <div style="background:#eefaf7;border:1px solid #a9e5d8;border-radius:10px;padding:16px;text-align:center;">
            <p style="margin:0;color:#0e6058;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Reference code</p>
            <p style="margin:6px 0 0;color:#0e3f3b;font-size:30px;font-weight:700;letter-spacing:.06em;">${e(input.referenceCode)}</p>
          </div>
        </td></tr>

        <tr><td style="padding:20px 24px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${row('What', input.serviceName)}
            ${input.doctorName ? row('Who', input.doctorName) : ''}
            ${row('When', `${formatManilaDate(input.start)} at ${formatManilaTime(input.start)}`)}
            ${row('Where', input.clinic.address)}
          </table>
        </td></tr>

        ${
          input.prepInstructions
            ? `<tr><td style="padding:18px 24px 0;">
          <div style="background:#fff8eb;border:1px solid #fde3ab;border-radius:10px;padding:14px 16px;">
            <p style="margin:0;color:#7a4f07;font-size:13px;font-weight:700;">Before you come</p>
            <p style="margin:6px 0 0;color:#294340;font-size:14px;line-height:1.6;">${e(input.prepInstructions)}</p>
          </div>
        </td></tr>`
            : ''
        }

        <tr><td style="padding:18px 24px 0;">
          <ul style="margin:0;padding-left:18px;color:#294340;font-size:14px;line-height:1.7;">
            <li>Nothing to pay online. You pay at the clinic.</li>
            <li>Please arrive about 10 minutes early.</li>
            <li>Bring a valid ID. Senior citizens and persons with disability should bring their booklet or ID for the 20% discount the law provides.</li>
          </ul>
        </td></tr>

        <tr><td style="padding:20px 24px 4px;">
          <div style="border-top:1px solid #dbe6e3;padding-top:18px;">
            <p style="margin:0 0 12px;color:#294340;font-size:14px;line-height:1.6;">Cannot make it? Please cancel so we can offer the slot to someone else.</p>
            <a href="${cancelUrl}" style="display:inline-block;background:#0e6058;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">Cancel this appointment</a>
            <p style="margin:12px 0 0;color:#5e726f;font-size:13px;line-height:1.6;">Or ring us on ${e(phones)}.</p>
          </div>
        </td></tr>

        <tr><td style="padding:20px 24px 24px;">
          <div style="border-top:1px solid #dbe6e3;padding-top:14px;color:#5e726f;font-size:12px;line-height:1.6;">
            <p style="margin:0;font-weight:600;color:#294340;">${e(input.clinic.name)}</p>
            <p style="margin:2px 0 0;">${e(input.clinic.address)}</p>
            <p style="margin:2px 0 0;">${e(phones)}</p>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Shown to staff in the inquiry email; reused for the admin booking list. */
export function describeBooking(input: {
  serviceName: string;
  doctorName: string | null;
  start: Date;
  mobile: string;
}): string {
  return [
    input.serviceName,
    input.doctorName,
    `${formatManilaDate(input.start)} ${formatManilaTime(input.start)}`,
    formatMobile(input.mobile),
  ]
    .filter(Boolean)
    .join(' · ');
}
