'use server';

import { db } from '@/db';
import { BookingError, createBooking } from '@/lib/booking';
import { sendEmail } from '@/lib/email';
import {
  confirmationHtml,
  confirmationSubject,
  confirmationText,
} from '@/lib/email-templates';
import { getDoctorById, getServiceById, getSiteSettings } from '@/lib/queries';
import { checkRateLimit, clientIp, pruneRateLimits } from '@/lib/rate-limit';
import { createBookingSchema } from '@/lib/validation';

/**
 * The state the booking form renders from.
 *
 * On success this carries everything the confirmation screen shows. Nothing goes into
 * the URL: the reference code and the patient's details stay in the POST response, so
 * they never reach browser history, a shared link or a server access log.
 */
/** What the patient typed, echoed back so a rejected form is not wiped. */
export type BookingValues = {
  fullName: string;
  mobile: string;
  email: string;
  notes: string;
  consent: boolean;
};

export type BookingState =
  | { status: 'idle' }
  | {
      status: 'error';
      message?: string;
      fieldErrors?: Record<string, string>;
      values?: BookingValues;
    }
  | {
      status: 'booked';
      referenceCode: string;
      serviceName: string;
      doctorName: string | null;
      /** ISO string; the client component formats it in Manila time. */
      startIso: string;
      prepInstructions: string | null;
      /** False when the confirmation email could not be sent. */
      emailSent: boolean;
      emailAddress: string;
    };

const MAX_BOOKINGS_PER_HOUR = 6;

export async function submitBooking(
  _previous: BookingState,
  formData: FormData,
): Promise<BookingState> {
  /*
   * Echoed back on every failure path. Losing a filled-in form because one checkbox was
   * missed means retyping a name, a mobile and an email on a phone, which is exactly
   * where people give up and ring instead.
   */
  const values: BookingValues = {
    fullName: String(formData.get('fullName') ?? ''),
    mobile: String(formData.get('mobile') ?? ''),
    email: String(formData.get('email') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    consent: formData.get('consent') === 'on',
  };

  const parsed = createBookingSchema.safeParse({
    serviceId: formData.get('serviceId') ?? '',
    doctorId: formData.get('doctorId') ?? '',
    sessionId: formData.get('sessionId') ?? '',
    start: formData.get('start') ?? '',
    fullName: formData.get('fullName') ?? '',
    mobile: formData.get('mobile') ?? '',
    email: formData.get('email') ?? '',
    notes: formData.get('notes') ?? '',
    consent: formData.get('consent') ?? undefined,
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
      values,
    };
  }

  // A bot filled the hidden field. Do not book, but do not tell it that.
  if (parsed.data.website) {
    return {
      status: 'error',
      message: 'We could not complete that booking. Please ring the clinic.',
      values,
    };
  }

  const ip = await clientIp();
  const limit = await checkRateLimit(`booking:${ip}`, MAX_BOOKINGS_PER_HOUR, 3600);
  if (!limit.ok) {
    return {
      status: 'error',
      message:
        'That is several bookings in a short time. Please ring the clinic if you need another appointment today.',
      values,
    };
  }
  void pruneRateLimits();

  const input = parsed.data;

  try {
    const booking = await createBooking(db, {
      serviceId: input.serviceId,
      doctorId: input.doctorId ?? null,
      sessionId: input.sessionId,
      start: input.start,
      patient: {
        fullName: input.fullName,
        mobile: input.mobile,
        email: input.email,
      },
      notes: input.notes ?? null,
      consentAt: new Date(),
    });

    const [service, doctor, settings] = await Promise.all([
      getServiceById(input.serviceId),
      input.doctorId ? getDoctorById(input.doctorId) : Promise.resolve(null),
      getSiteSettings(),
    ]);

    /*
     * The booking is already saved. From here nothing may throw: if the email fails the
     * patient still has a real appointment, and the screen tells them the reference code
     * is the part that matters.
     */
    let emailSent = false;
    try {
      const payload = {
        referenceCode: booking.referenceCode,
        cancelToken: booking.cancelToken,
        patientName: input.fullName,
        serviceName: service?.name ?? 'Your appointment',
        doctorName: doctor?.fullName ?? null,
        start: booking.scheduledStart,
        prepInstructions: service?.prepInstructions ?? null,
        clinic: {
          name: settings.clinicName,
          address: settings.address,
          phonePrimary: settings.phonePrimary,
          phoneSecondary: settings.phoneSecondary,
        },
      };

      const result = await sendEmail({
        to: input.email,
        subject: confirmationSubject(payload),
        text: confirmationText(payload),
        html: confirmationHtml(payload),
      });

      emailSent = result.ok;
      if (!result.ok) console.error('[booking] confirmation email failed:', result.error);
    } catch (error) {
      console.error('[booking] confirmation email threw:', error);
    }

    return {
      status: 'booked',
      referenceCode: booking.referenceCode,
      serviceName: service?.name ?? 'Your appointment',
      doctorName: doctor?.fullName ?? null,
      startIso: booking.scheduledStart.toISOString(),
      prepInstructions: service?.prepInstructions ?? null,
      emailSent,
      emailAddress: input.email,
    };
  } catch (error) {
    if (error instanceof BookingError) {
      const messages: Record<string, string> = {
        slot_full: 'Sorry, someone took that time while you were filling this in. Please pick another.',
        slot_past_cutoff: 'That time is too close to now to book online. Please ring the clinic.',
        slot_blacked_out: 'The clinic is closed that day. Please pick another date.',
        slot_not_in_session: 'That time is no longer one of our slots. Please pick another.',
        session_not_found: 'That clinic session is no longer running. Please start again.',
        service_not_found: 'That service is no longer offered. Please start again.',
        service_not_bookable: 'That service cannot be booked online. Please ring the clinic.',
        doctor_not_available_for_service:
          'That doctor does not hold this clinic. Please start again.',
      };
      return { status: 'error', message: messages[error.reason] ?? error.message, values };
    }

    console.error('[booking] unexpected failure:', error);
    return {
      status: 'error',
      message:
        'Something went wrong at our end and the booking was not made. Please try again, or ring the clinic.',
      values,
    };
  }
}
