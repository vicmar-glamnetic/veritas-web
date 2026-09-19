'use server';

import { cancelBookingById, findBookingByCancelToken } from '@/lib/booking-lookup';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export type CancelState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'cancelled' }
  | { status: 'already_cancelled' };

/**
 * Cancelling from the emailed link.
 *
 * The token is the whole credential, so it is never used to *read* anything sensitive
 * beyond what the recipient already has in their inbox, and it does exactly one thing.
 */
export async function cancelByToken(
  _previous: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const token = String(formData.get('token') ?? '').trim();
  if (!token) return { status: 'error', message: 'That cancellation link is not valid.' };

  const ip = await clientIp();
  const limit = await checkRateLimit(`cancel:${ip}`, 20, 3600);
  if (!limit.ok) {
    return { status: 'error', message: 'Too many attempts. Please ring the clinic instead.' };
  }

  const booking = await findBookingByCancelToken(token);
  if (!booking) {
    return {
      status: 'error',
      message:
        'That cancellation link is not valid. It may have already been used. Please ring the clinic.',
    };
  }

  const outcome = await cancelBookingById(booking.id);

  if (outcome === 'already_cancelled') return { status: 'already_cancelled' };
  if (outcome === 'too_late') {
    return {
      status: 'error',
      message:
        'You are already marked as arrived for this appointment, so it cannot be cancelled here.',
    };
  }
  if (outcome === 'not_found') {
    return { status: 'error', message: 'We could not find that booking. Please ring the clinic.' };
  }

  return { status: 'cancelled' };
}
