'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db';
import { staffUsers } from '@/db/schema';
import { createSession } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export type LoginState = { status: 'idle' | 'error'; message?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Enter your email address.').max(200),
  password: z.string().min(1, 'Enter your password.').max(200),
});

/** Slow enough to make guessing pointless, loose enough not to lock out a typo. */
const MAX_ATTEMPTS_PER_HOUR = 10;

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email') ?? '',
    password: formData.get('password') ?? '',
  });

  const email = String(formData.get('email') ?? '');

  if (!parsed.success) {
    return { status: 'error', message: 'Enter both your email address and password.', email };
  }

  const ip = await clientIp();
  const limit = await checkRateLimit(`login:${ip}`, MAX_ATTEMPTS_PER_HOUR, 3600);
  if (!limit.ok) {
    return {
      status: 'error',
      message: 'Too many attempts from this connection. Please wait a while and try again.',
      email,
    };
  }

  const [user] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, parsed.data.email))
    .limit(1);

  /*
   * Always run a verification, even when the email is unknown, so the response takes the
   * same time either way. Otherwise a fast rejection tells an attacker which addresses
   * are real, which is half of what they need.
   */
  const hash =
    user?.passwordHash ??
    'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
  const passwordOk = await verifyPassword(parsed.data.password, hash);

  if (!user || !user.isActive || !passwordOk) {
    // Deliberately one message for every failure: wrong email, wrong password, or a
    // deactivated account all look identical from outside.
    return { status: 'error', message: 'That email address and password do not match.', email };
  }

  await db
    .update(staffUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(staffUsers.id, user.id));

  await createSession(user.id);
  redirect('/admin');
}
