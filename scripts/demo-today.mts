/**
 * Puts a handful of bookings on today's laboratory session.
 *
 * The seed deliberately creates no bookings, so a fresh database shows an empty Today
 * screen. That is correct, but it makes the screen impossible to demo or test against.
 * This adds a realistic morning: one already arrived, the rest still expected, one with
 * a note from the patient.
 *
 * Re-running it clears the bookings it made before, so the screen looks the same every
 * time. Without that, each run piled four more on top and left earlier ones marked
 * arrived, which made the screen impossible to demo twice or to test against.
 *
 *   npm run db:demo-today
 */
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'], quiet: true });

const { createDb } = await import('@/db/client');
const { manilaDateString, manilaToUtc } = await import('@/lib/time');
const { generateCancelToken } = await import('@/lib/reference');

const { pool } = createDb();
const today = manilaDateString();

const DEMO_MOBILE_PREFIX = '+63917555099';

/**
 * Everything this script and the browser tests create uses Resend's simulator address,
 * which no real patient would ever have. That is the safe handle for clearing up: it
 * cannot match a genuine booking. booking_events cascade with the bookings.
 */
const DEMO_EMAIL = 'delivered@resend.dev';

const previous = await pool.query(
  `delete from bookings b using patients p
    where p.id = b.patient_id and p.email = $1`,
  [DEMO_EMAIL],
);
await pool.query(
  `delete from patients p where p.email = $1
     and not exists (select 1 from bookings b where b.patient_id = p.id)`,
  [DEMO_EMAIL],
);
if (previous.rowCount) console.log(`Cleared ${previous.rowCount} booking(s) from earlier runs.`);

const session = (
  await pool.query(
    `select id, start_time, slot_minutes from sessions
     where service_category = 'laboratory'
       and day_of_week = extract(dow from $1::date)
       and is_active
     order by start_time limit 1`,
    [today],
  )
).rows[0];

if (!session) {
  console.log(`No laboratory session runs on ${today}, so there is nothing to demo.`);
  await pool.end();
  process.exit(0);
}

const service = (
  await pool.query(`select id from services where name = 'Complete Blood Count (CBC)' limit 1`)
).rows[0];

const people = [
  { name: 'Corazon Aquino', note: 'Fasting since 9pm. Please call if delayed.' },
  { name: 'Andres Bonifacio', note: null },
  { name: 'Melchora Aquino', note: null },
  { name: 'Apolinario Mabini', note: 'Coming with my mother, she also wants a check-up.' },
];

const stamp = Date.now().toString(36).slice(-4).toUpperCase();
const created: string[] = [];

for (const [i, person] of people.entries()) {
  const start = manilaToUtc(today, String(session.start_time).slice(0, 5));
  const slot = new Date(start.getTime() + i * session.slot_minutes * 60_000);
  const reference = `VRT-${stamp}${i}`;

  const patient = (
    await pool.query(
      `insert into patients (full_name, mobile, email, source)
       values ($1, $2, 'delivered@resend.dev', 'online') returning id`,
      [person.name, `${DEMO_MOBILE_PREFIX}${i}`],
    )
  ).rows[0];

  const booking = (
    await pool.query(
      `insert into bookings (reference_code, patient_id, service_id, session_id,
         scheduled_start, scheduled_end, slot_index, status, notes, consent_at, cancel_token)
       values ($1,$2,$3,$4,$5,$6,0,'booked',$7, now(), $8) returning id`,
      [
        reference,
        patient.id,
        service.id,
        session.id,
        slot,
        new Date(slot.getTime() + session.slot_minutes * 60_000),
        person.note,
        generateCancelToken(),
      ],
    )
  ).rows[0];

  await pool.query(
    `insert into booking_events (booking_id, from_status, to_status, actor, reason)
     values ($1, null, 'booked', 'patient', 'Booked online')`,
    [booking.id],
  );

  created.push(`${reference} ${person.name}`);
}

// One already through the door, so the progress bar is not at zero.
await pool.query(`update bookings set status = 'arrived' where reference_code = $1`, [
  `VRT-${stamp}0`,
]);

console.log(`Added ${created.length} bookings to ${today}:`);
for (const line of created) console.log(`  ${line}`);
await pool.end();
