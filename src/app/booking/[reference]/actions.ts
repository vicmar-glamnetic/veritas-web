'use server';

import {
  cancelBookingById,
  findBookingByReferenceAndMobile,
  type BookingView,
} from '@/lib/booking-lookup';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { bookingLookupSchema } from '@/lib/validation';

export type LookupState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; fieldErrors?: Record<string, string> }
  | { status: 'found'; booking: SerializedBooking; justCancelled?: boolean };

/** Date objects do not survive the server-action boundary, so send ISO strings. */
export type SerializedBooking = Omit<BookingView, 'scheduledStart' | 'scheduledEnd'> & {
  scheduledStartIso: string;
  scheduledEndIso: string;
};

function serialize(booking: BookingView): SerializedBooking {
  const { scheduledStart, scheduledEnd, ...rest } = booking;
  return {
    ...rest,
    scheduledStartIso: scheduledStart.toISOString(),
    scheduledEndIso: scheduledEnd.toISOString(),
  };
}

/**
 * Looking up a booking is rate limited because the reference code is short. The mobile
 * number has to match as well, but an unthrottled endpoint is still an invitation to
 * enumerate, so the two together get a budget per IP.
 */
const MAX_LOOKUPS_PER_HOUR = 12;

type Credentials = { reference: string; mobile: string };

/**
 * Shared front half of both actions: validate, throttle, then fetch. Counting the rate
 * limit here rather than in each action means cancelling does not burn two attempts.
 */
async function authenticate(
  formData: FormData,
): Promise<
  { ok: true; credentials: Credentials; booking: BookingView } | { ok: false; state: LookupState }
> {
  const parsed = bookingLookupSchema.safeParse({
    reference: formData.get('reference') ?? '',
    mobile: formData.get('mobile') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '');
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return {
      ok: false,
      state: { status: 'error', message: 'Please check the fields below.', fieldErrors },
    };
  }

  const ip = await clientIp();
  const limit = await checkRateLimit(`lookup:${ip}`, MAX_LOOKUPS_PER_HOUR, 3600);
  if (!limit.ok) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'Too many attempts. Please wait a while, or ring the clinic.',
      },
    };
  }

  const booking = await findBookingByReferenceAndMobile(
    parsed.data.reference,
    parsed.data.mobile,
  );

  if (!booking) {
    // Deliberately vague. Saying which half was wrong would help someone guessing.
    return {
      ok: false,
      state: {
        status: 'error',
        message:
          'We could not find a booking with that reference and mobile number. Check both and try again, or ring the clinic.',
      },
    };
  }

  return { ok: true, credentials: parsed.data, booking };
}

export async function lookupBooking(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const result = await authenticate(formData);
  if (!result.ok) return result.state;
  return { status: 'found', booking: serialize(result.booking) };
}

export async function cancelFromLookup(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  // Ownership is proved again on the cancel POST itself, so a stale page left open on a
  // shared phone cannot cancel anything without the mobile number being re-entered.
  const result = await authenticate(formData);
  if (!result.ok) return result.state;

  const outcome = await cancelBookingById(result.booking.id);

  if (outcome === 'too_late') {
    return {
      status: 'error',
      message:
        'This appointment is already marked as arrived, so it cannot be cancelled here. Please speak to the front desk.',
    };
  }

  const refreshed = await findBookingByReferenceAndMobile(
    result.credentials.reference,
    result.credentials.mobile,
  );

  return {
    status: 'found',
    booking: refreshed ? serialize(refreshed) : { ...serialize(result.booking), isCancelled: true },
    justCancelled: outcome === 'cancelled',
  };
}
