@AGENTS.md

# Veritas Clinic — website and booking system

A private clinic in the Philippines. Phase 1 is a public website with online appointment
booking plus a staff admin area. Later phases grow this into a patient queueing and
records system, so **the data model matters more than the styling** — schema decisions
here are meant to survive into the clinic system.

## Hard constraints

These are not negotiable without asking the client.

- **Timezone** — the clinic is `Asia/Manila` (UTC+8, no DST). Every instant is stored in
  UTC and rendered in Manila. Never use server local time: on Vercel it is UTC, on a
  laptop it is anything. All conversions go through `src/lib/time.ts`.
- **Currency** — PHP, rendered `₱450` via `formatPhp` in `src/lib/money.ts`. Prices live
  in `numeric(10,2)` columns and stay strings until display. No floats.
- **No online payment** in this phase. Patients pay at the clinic.
- **No patient accounts.** A booking is identified by its reference code plus the mobile
  number used to book. There is no patient login and no password.
- **Mobile first.** Most visitors arrive from a Facebook link, on a low-end Android
  phone, on mobile data. Pages must work and be legible before they are clever.
- **Philippine Data Privacy Act** — collect the minimum personal data, show a consent
  checkbox linking to `/privacy` on the booking form, store `consent_at`, and never put
  personal data in a URL or query string.

## Stack — fixed, do not substitute

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL on Neon |
| ORM / migrations | Drizzle ORM + `drizzle-kit` |
| Email | Resend |
| Validation | Zod, on the server, for every input |
| Hosting | Vercel (free `*.vercel.app` subdomain for now) |

No component library, no state manager, no second ORM, no third-party auth provider.
Keep the dependency list short — it is currently Drizzle, Neon, Zod, Resend, and `pg`
for scripts and tests.

**Passwords** use `scrypt` from `node:crypto` (`src/lib/password.ts`), not bcrypt or
argon2, to avoid a native dependency.

## Two database clients

- `src/db/index.ts` — Neon **HTTP** driver. This is what the deployed app uses.
  It cannot run interactive transactions; see the concurrency note below.
- `src/db/node-client.ts` — **TCP** driver (`pg`), used only by the seed script and the
  test suite. It also talks to a plain local Postgres, so tests need no network.

Both are Drizzle over the same schema, so queries are written once.

## Data model notes

Full schema with comments: `src/db/schema.ts`. Things that are easy to get wrong:

- **`sessions` is the clinic sense of the word** — a recurring weekly block of clinic
  time, e.g. "Dra. Reyes, Mondays 09:00–12:00, 20-minute slots". Staff login sessions
  live in `staff_sessions`. Do not conflate them.
- **`start_time` / `end_time` on `sessions` are Manila wall-clock `time` values**, not
  instants. They are combined with a date in Manila and converted to UTC.
- **`day_of_week` is 0 = Sunday .. 6 = Saturday**, matching both JS `getDay()` and
  Postgres `extract(dow)`.
- **Calendar dates** (blackouts, promo windows, date of birth) are `date` in
  `mode: 'string'`, so a timezone conversion can never shift them by a day.
- **`capacity` vs `online_capacity`** — `capacity` is total seats per slot;
  `online_capacity` is how many the booking form may give away. The difference is held
  back for walk-ins. A check constraint enforces `online_capacity <= capacity`.
- **`services` is the single price list.** The public `/prices` page reads it, and the
  future cashier will read the same rows. There is no second price table.
- **Nothing that a booking points at is ever hard-deleted.** Doctors and services are
  deactivated (`is_active`), and the foreign keys are `on delete restrict`.
- **`patients.merged_into_id`** exists for the future walk-in merge: when the clinic
  system finds that an online patient and a walk-in record are the same person, the
  loser points at the winner instead of being deleted.

## Concurrency: how the last slot is protected

Two people tapping "Confirm" on the last seat at the same moment must not both succeed.

The guard is a **partial unique index**, not application logic:

```sql
CREATE UNIQUE INDEX bookings_slot_seat_key
  ON bookings (session_id, scheduled_start, slot_index)
  WHERE status IN ('booked', 'arrived', 'no_show');
```

`slot_index` is the **seat number within a slot**, 0-based. Application code assigns the
lowest free seat and only ever where `slot_index < sessions.online_capacity`. The loser
of a race fails on the index, not on a read-then-write check that could interleave.
Cancelled bookings drop out of the index and release their seat.

This is why the HTTP driver's lack of interactive transactions is acceptable: the
invariant lives in the database, not in a transaction.

## Availability rules

The booking calendar is always computed, never hand-maintained:

1. Find active `sessions` matching the service's category (and the chosen doctor, for
   consultations).
2. Expand into dated slots over `site_settings.booking_horizon_days` (default 30),
   skipping blackout dates.
3. Divide each session into `slot_minutes` slots; spread `online_capacity` across them.
4. Drop slots starting sooner than `booking_cutoff_hours` from now.
5. Drop slots whose live bookings have reached online capacity.
6. Return only dates with at least one open slot, so the calendar can grey out full days.

A `session_blackouts` row blocks one date, targeting either one session, or one doctor
(all their sessions), or — with both null — the whole clinic, for holidays.

## Non-functional requirements

- Validate **every** server action with Zod. Never trust the client.
- Rate-limit booking creation and the inquiry form by IP. The counter is in the
  `rate_limits` table, because in-memory counters do not survive Vercel's instances.
- No personal data in URLs. `cancel_token` goes in the path and does one thing only.
- SEO: page titles, meta descriptions, Open Graph tags with a clinic image, so Facebook
  link previews look right.
- Accessibility: real `<label>`s, visible focus states, sufficient contrast, working
  browser back button.
- **Fail visibly, not silently.** If the confirmation email fails to send, the booking
  still succeeds and the screen says the reference code is the important part.

## Out of scope for this phase

Do not build these. If one seems necessary, say so and wait.

Online payment · SMS · patient login · rescheduling (cancel and rebook only) · results
viewing · billing · queue display · laboratory or imaging modules.

## Commands

```
npm run dev           # local dev server
npm run db:generate   # write a migration from schema changes (offline)
npm run db:migrate    # apply migrations
npm run db:seed       # demo data; --force if bookings already exist
npm run db:studio     # Drizzle Studio
npm run typecheck
```

Environment variables are documented in `.env.example`. Never commit a real one.

## Working style

- Milestones are reviewed one at a time. Do not run ahead into the next one.
- Keep commits small, with clear messages.
- **Ask rather than guess when a requirement is ambiguous — especially anything about
  clinic scheduling rules, which come from the client, not from us.**
- The seeded content (address, phone numbers, doctor names, prices, session times) is
  plausible placeholder data for demos. All of it needs client confirmation before launch.
