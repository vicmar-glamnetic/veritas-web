/**
 * Puts a handful of bookings on today's clinic, across all three categories.
 *
 * The seed deliberately creates no bookings, so a fresh database shows an empty Today
 * screen. That is correct, but it makes the screen impossible to demo or test against.
 * This adds a realistic morning to each of consultation, laboratory and imaging: one
 * already arrived, the rest still expected, some with a note from the patient. All three
 * because the waiting-room board at /admin/monitor has a panel each.
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

/**
 * All three categories, because the waiting-room board at /admin/monitor has a panel
 * each for consultation, laboratory and imaging. Demoing it with only laboratory rows
 * left two thirds of the screen showing an em dash.
 */
const CATEGORIES = [
  {
    category: 'consultation',
    people: [
      { name: 'Corazon Aquino', note: 'Follow-up on my blood pressure.' },
      { name: 'Andres Bonifacio', note: null },
      { name: 'Melchora Aquino', note: null },
    ],
  },
  {
    category: 'laboratory',
    people: [
      { name: 'Apolinario Mabini', note: 'Fasting since 9pm. Please call if delayed.' },
      { name: 'Gregoria de Jesus', note: null },
      { name: 'Marcelo del Pilar', note: 'Coming with my mother, she also wants a check-up.' },
    ],
  },
  {
    category: 'imaging',
    people: [
      { name: 'Gabriela Silang', note: null },
      { name: 'Juan Luna', note: null },
    ],
  },
] as const;

// Two characters, so `VRT-` + stamp + category + index is exactly the width of a real
// reference code. A demo board with wider codes than the live one is a bad demo.
const stamp = Date.now().toString(36).slice(-2).toUpperCase();
const created: string[] = [];
let mobileSeq = 0;

for (const [c, group] of CATEGORIES.entries()) {
  /*
   * Prefer a session that genuinely runs today, so the demo matches the real schedule.
   *
   * Falling back to any active session of the category matters more than it sounds: the
   * clinic is shut on a Sunday, and a Sunday is exactly when someone sits down to demo
   * the screens. The booking still lands on today's date either way, which is all the
   * Today list and the waiting-room board read.
   */
  const session =
    (
      await pool.query(
        `select id, doctor_id, start_time, slot_minutes from sessions
         where service_category = $2
           and day_of_week = extract(dow from $1::date)
           and is_active
         order by start_time limit 1`,
        [today, group.category],
      )
    ).rows[0] ??
    (
      await pool.query(
        `select id, doctor_id, start_time, slot_minutes from sessions
         where service_category = $1 and is_active
         order by day_of_week, start_time limit 1`,
        [group.category],
      )
    ).rows[0];

  const service = (
    await pool.query(
      `select id from services where category = $1 and is_active and is_bookable_online
       order by name limit 1`,
      [group.category],
    )
  ).rows[0];

  // A category with no clinic that weekday is normal, not an error: Saturday has no
  // imaging session. Skip it and let the board show an honest empty panel.
  if (!session || !service) {
    console.log(`No active ${group.category} session exists at all — skipping.`);
    continue;
  }

  const first: string[] = [];

  for (const [i, person] of group.people.entries()) {
    const start = manilaToUtc(today, String(session.start_time).slice(0, 5));
    const slot = new Date(start.getTime() + i * session.slot_minutes * 60_000);
    const reference = `VRT-${stamp}${c}${i}`;

    const patient = (
      await pool.query(
        `insert into patients (full_name, mobile, email, source)
         values ($1, $2, 'delivered@resend.dev', 'online') returning id`,
        [person.name, `${DEMO_MOBILE_PREFIX}${mobileSeq++}`],
      )
    ).rows[0];

    const booking = (
      await pool.query(
        `insert into bookings (reference_code, patient_id, service_id, doctor_id, session_id,
           scheduled_start, scheduled_end, slot_index, status, notes, consent_at, cancel_token)
         values ($1,$2,$3,$4,$5,$6,$7,0,'booked',$8, now(), $9) returning id`,
        [
          reference,
          patient.id,
          service.id,
          session.doctor_id,
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

    created.push(`${reference}  ${group.category.padEnd(12)} ${person.name}`);
    first.push(reference);
  }

  /*
   * One already through the door in each category, so the Today progress bar is not at
   * zero and every panel of the waiting-room board has a number on it.
   *
   * `updated_at` is bumped deliberately: the board reads "now serving" as the arrived
   * booking with the most recent update, and leaving it at the insert default would make
   * the choice between categories depend on row order.
   */
  await pool.query(
    `update bookings set status = 'arrived', updated_at = now() where reference_code = $1`,
    [first[0]],
  );
}

if (created.length === 0) {
  console.log('No active sessions exist, so there is nothing to demo. Run npm run db:seed.');
  await pool.end();
  process.exit(0);
}

console.log(`Added ${created.length} bookings to ${today}:`);
for (const line of created) console.log(`  ${line}`);
console.log('\nOne per category is marked arrived, so /admin/monitor has something to show.');
await pool.end();
