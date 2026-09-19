# Veritas Clinic — complete system overview

A self-contained description of this website, written so it can be understood without
reading the code. If you have the repository, `CLAUDE.md` holds the working rules for
changing it; this file explains what exists and why.

- **Live:** https://veritas-clinic-ph.vercel.app
- **Repository:** https://github.com/vicmar-glamnetic/veritas-web (private)
- **Status:** built and deployed. All content is placeholder pending the client's real
  details. Search engines are deliberately blocked. See *Current state* at the end.

---

## 1. What this is

A public website and booking system for **Veritas Clinic**, a private clinic in the
Philippines offering consultations, laboratory tests, X-ray, ultrasound, ECG and 2D
echocardiogram.

It does two jobs:

1. **For patients** — a public site where they can see services, prices, doctors and
   promos, and book an appointment online in about a minute.
2. **For staff** — an admin area where reception manages the day's arrivals, and the
   clinic manages its schedule, prices, doctors, promos and staff accounts.

This is phase one. It is designed to grow into a patient queueing and records system, so
**the data model is deliberately richer than phase one needs**. Several columns exist
only to make that future possible.

### Who uses it

- **Patients.** Most arrive from a Facebook link, on a low-end Android phone, on mobile
  data. Mobile-first is not a preference here, it is the primary case.
- **Reception staff.** Desktop at the front desk, all day, often in a hurry.
- **Clinic admin.** Occasional, for prices, schedules and staff.

---

## 2. Hard constraints

These are product decisions, not technical preferences. Changing any of them requires
asking the clinic.

| Constraint | Detail |
|---|---|
| **Timezone** | The clinic is `Asia/Manila` (UTC+8, no DST). Every instant is stored in UTC and rendered in Manila. Server local time is never used: on Vercel it is UTC. |
| **Currency** | Philippine pesos, rendered `₱450`. Prices are `numeric(10,2)` and stay strings until display. No floats anywhere. |
| **No online payment** | Patients pay at the clinic. Nothing is charged through the site. |
| **No patient accounts** | There is no patient login and no patient password. A booking is identified by a reference code plus the mobile number it was booked with. |
| **Mobile first** | Pages must work and be legible before they are clever. |
| **Data Privacy Act (RA 10173)** | Collect the minimum personal data, show a consent checkbox linking to the privacy notice, store `consent_at`, and never put personal data in a URL or query string. |

### Explicitly out of scope for this phase

Online payment · SMS · patient login · rescheduling (cancel and rebook only) · results
viewing · billing · laboratory or imaging modules.

Queue display was on that list until the client asked for one. What was built is a
read-only board (§10), not a queueing system: nothing calls, numbers, defers or reorders
a patient. That remains a later phase.

---

## 3. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 (CSS-first `@theme`, no config file) |
| Database | PostgreSQL 18 on Neon, region `aws-ap-southeast-1` (Singapore) |
| ORM / migrations | Drizzle ORM + `drizzle-kit` |
| Database driver | `pg` (node-postgres) |
| Email | Resend |
| Validation | Zod, on the server, for every input |
| Hosting | Vercel, function region `sin1` |
| Tests | `node --test` with `tsx`. No test framework dependency. |

**Runtime dependencies are deliberately few:** `drizzle-orm`, `pg`, `zod`, `resend`,
plus Next and React. No component library, no state manager, no second ORM, no
third-party auth provider.

Passwords use `scrypt` from `node:crypto`, not bcrypt or argon2, to avoid a native
dependency.

### Why node-postgres and not Neon's HTTP driver

The HTTP driver cannot run interactive transactions. The booking insert needs the
booking row and its audit row written atomically, and it takes a row lock. Neon accepts
ordinary Postgres connections on its pooled (`-pooler`) endpoint, which is what the
deployed app uses. The TCP driver also speaks to any Postgres, so tests run against a
local cluster with no network.

---

## 4. Directory map

```
src/
  app/
    layout.tsx              Document shell only: <html>, <body>, metadata, globals.css
    globals.css             Design tokens (@theme), base styles
    icon.tsx                Generated favicon
    opengraph-image.tsx     Generated OG image for Facebook link previews
    robots.ts  sitemap.ts

    (site)/                 The patient-facing site. Route group: adds no URL segment.
      layout.tsx            Header, the one <main>, footer, mobile call/book bar
      page.tsx              Home
      services/  doctors/  prices/  promos/  contact/  privacy/
      book/                 The four-step booking flow
      booking/              Lookup and cancellation
      not-found.tsx

    admin/
      layout.tsx            noindex + title template. NO auth guard here.
      login/                Public: sign-in form
      (app)/                Route group. layout.tsx calls requireStaff().
        page.tsx            Today
        bookings/  schedules/  services/  doctors/  promos/  settings/  staff/
        actions.ts          Booking status changes, sign out
        crud-actions.ts     Create, update and delete for every entity
        ui.tsx              Shared admin form primitives
        row-dialog.tsx      Dialog + delete-confirmation helpers

  components/               Shared between site and admin
    site-header.tsx  site-footer.tsx  nav-links.tsx  mobile-actions.tsx
    ui.tsx                  Public-site primitives
    confirm-dialog.tsx      Progressively-enhanced confirmation dialog

  db/
    schema.ts               The whole schema, heavily commented
    client.ts               createDb(): Drizzle over a pg Pool
    index.ts                The app's cached singleton
    seed.ts                 Demo data

  lib/
    time.ts                 Manila <-> UTC. The only sanctioned crossing.
    availability.ts         The availability engine
    booking.ts              createBooking, transactional
    booking-lookup.ts       Find and cancel by reference+mobile or token
    auth.ts                 Staff sessions
    queries.ts              Public-site reads, wrapped in React cache
    admin/                  queries.ts, schemas.ts (Zod), status.ts
    email.ts  email-templates.ts
    money.ts  mobile.ts  password.ts  reference.ts  validation.ts
    rate-limit.ts  site.ts  indexing.ts  schedule-display.ts

scripts/
  demo-today.mts            Put demo bookings on today (idempotent)
  clear-rate-limits.mts     Reset rate-limit counters
```

---

## 5. Data model

13 tables. Nothing a booking points at is ever hard-deleted; rows are deactivated
(`is_active`) and the foreign keys are `on delete restrict`.

### Enums

```
service_category  consultation | laboratory | imaging
booking_status    booked | cancelled_by_patient | cancelled_by_clinic | arrived | no_show
booking_actor     patient | staff | system
patient_source    online | walkin
staff_role        admin | reception
```

### Tables

**`patients`** — `id, full_name, mobile, email, date_of_birth, source, merged_into_id,
created_at, updated_at`

Mobile is stored normalised to E.164 (`+639XXXXXXXXX`) so lookup and future deduplication
match on equality. `email` is nullable because walk-in records captured at the desk often
have none. `merged_into_id` is a self-reference for the future walk-in merge: when the
clinic system finds an online patient and a walk-in record are the same person, the loser
points at the winner rather than being deleted.

**`doctors`** — `id, full_name, specialty, is_active, photo_url, bio, sort_order,
created_at`

**`services`** — `id, name, category, price_php, duration_minutes, is_bookable_online,
is_listed_online, prep_instructions, sort_order, is_active, created_at`

**This is the single price list.** The public prices page reads it and the future cashier
will read the same rows. There is no second price table. `prep_instructions` is repeated
in the confirmation email (fasting, full bladder, and so on).

**`service_doctors`** — join table, `(service_id, doctor_id)`. Which doctors deliver
which consultation services.

**`sessions`** — `id, doctor_id, service_category, day_of_week, start_time, end_time,
slot_minutes, capacity, online_capacity, booking_cutoff_hours, is_active, created_at`

A recurring weekly block of clinic time, e.g. "Dra. Reyes, Mondays 09:00–12:00,
20-minute slots". **This is the clinic sense of "session".** Staff login sessions are in
`staff_sessions`; do not conflate them.

- `day_of_week` is 0 = Sunday .. 6 = Saturday, matching JS `getDay()` and Postgres
  `extract(dow)`.
- `start_time` / `end_time` are **Manila wall-clock `time` values**, not instants.
- `doctor_id` is null for laboratory and imaging. A check constraint enforces that a
  consultation session has a doctor and a lab/imaging session does not.

**`session_blackouts`** — `id, session_id, doctor_id, date, reason, created_at`

Blocks one calendar date. Exactly one shape: `session_id` set (that session does not run),
`doctor_id` set (that doctor is away, all their sessions blocked), or **both null**
(clinic-wide closure, for a public holiday). A check constraint enforces at most one
target.

**`bookings`** — `id, reference_code, patient_id, service_id, doctor_id, session_id,
scheduled_start, scheduled_end, slot_index, status, notes, consent_at, cancel_token,
created_at, updated_at`

- `reference_code` — short and human-readable, `VRT-7K4Q`, from an alphabet with no
  ambiguous characters (no 0/O, 1/I/L, 5/S, 8/B) because patients read it over the phone.
- `cancel_token` — opaque secret, appears only in the emailed cancellation link, does
  nothing else.
- `slot_index` — **the seat number within a slot, 0-based.** See *Concurrency* below.
- `consent_at` — never null; the form cannot submit without the consent tick.

**`booking_events`** — `id, booking_id, from_status, to_status, actor,
actor_staff_user_id, reason, created_at`

Append-only audit log. Every status change writes a row, including creation
(`from_status` null → `booked`). `actor` is an enum plus a real foreign key to the staff
user rather than a `staff:<id>` string, so the reference has integrity. A check
constraint enforces that `actor = 'staff'` if and only if `actor_staff_user_id` is set.

**`promos`** — `id, title, body, image_url, starts_on, ends_on, is_active, sort_order,
created_at`

**`staff_users`** — `id, name, email, password_hash, role, is_active, last_login_at,
created_at`

**`staff_sessions`** — `id, staff_user_id, token_hash, expires_at, revoked_at, created_at`

**`site_settings`** — a single row, `id = 1` enforced by a check constraint. Clinic name,
address, phones, email, Facebook URL, opening hours text, map embed URL,
`booking_horizon_days`.

**`rate_limits`** — `key, count, window_start`. Fixed-window counters keyed
`<action>:<ip>`. In the database rather than memory because Vercel's serverless instances
do not share process memory.

### Calendar dates vs instants

Anything meaning "a day on the clinic's wall calendar" (blackouts, promo windows, date of
birth) is a `date` column read as a **string**, so a timezone conversion can never shift
it by a day. Anything meaning a point in time is `timestamptz` in UTC.

---

## 6. The two rules that are easiest to get wrong

### Capacity is per session, not per slot

`capacity` is how many patients a session takes **in total, across all its slots**.
`online_capacity` is how many of those places the booking form may give away; the rest
are held back for walk-ins. A check constraint enforces
`online_capacity <= capacity`.

So Dra. Reyes' 9-to-12 clinic in 20-minute slots has **9 slots**, sees **9 patients**, and
offers **6** of those places online.

`distributeOnlineCapacity(6, 9)` spreads those six across the nine slots as
`[1,1,0,1,1,0,1,1,0]` — walk-in places scattered through the morning rather than bunched
at the end, and the session's opening time always bookable.

### Concurrency: how the last slot is protected

Two people tapping Confirm on the last place at the same instant must not both succeed.
The guarantee is a **partial unique index**, not application logic:

```sql
CREATE UNIQUE INDEX bookings_slot_seat_key
  ON bookings (session_id, scheduled_start, slot_index)
  WHERE status IN ('booked', 'arrived', 'no_show');
```

`slot_index` is the seat number within a slot. Application code assigns the lowest free
seat, and only where `slot_index <` that slot's online capacity. The loser of a race
fails on the index, not on a read-then-write check that could interleave. Cancelled
bookings drop out of the index and release their seat.

`createBooking` additionally runs in a transaction that opens with
`SELECT ... FOR UPDATE` on the session row, so attempts queue rather than interleave and
capacity is actually used up. But **correctness does not depend on that lock** — the
invariant lives in the index.

Both guards are independently tested. Removing the lock breaks the "three places under a
stampede of twelve" test (capacity stops being fully used); dropping the index breaks the
forced-race test (two patients get the same seat).

---

## 7. The availability engine

`src/lib/availability.ts`. The booking calendar is always computed, never stored:

1. Find active `sessions` matching the service's category, and the chosen doctor for
   consultations.
2. Expand into dated slots over `site_settings.booking_horizon_days` (default 30),
   skipping blackout dates.
3. Divide each session into `slot_minutes` slots; spread `online_capacity` across them.
4. Drop slots starting sooner than `booking_cutoff_hours` from now.
5. Drop slots whose live bookings have reached that slot's online capacity.
6. Return only dates with at least one open slot, so the calendar can grey out full days.

`resolveChosenSlot` is separate and deliberately does **not** check availability — see
*Traps* below.

---

## 8. The public site

| Route | What it does |
|---|---|
| `/` | Hero, clinic details beside it on desktop, live promos, what the clinic does, "before you come", doctors, map |
| `/services` | Plain-language explanations of what each kind of test is actually like, then the real service lists |
| `/doctors` | Active doctors with clinic days **derived from their sessions**, collapsing Mon/Wed/Fri rows that share a time range into one line |
| `/prices` | The listed services, with client-side search and category filters, and the caveat that prices are confirmed at the clinic |
| `/promos` | Only promos live *today in Manila*, compared by calendar date so one ending today stays up all day |
| `/contact` | Address, phones, Facebook, map, and a Zod-validated inquiry form that emails the clinic |
| `/privacy` | RA 10173 privacy notice covering what the site actually does |
| `/book` | The booking flow |
| `/booking` and `/booking/[reference]` | Look up a booking with reference + mobile |
| `/booking/cancel/[token]` | The emailed cancellation link |

All public pages except the booking flow are prerendered and revalidated
(`export const revalidate`), so a visitor on mobile data gets static HTML.

### Design

- **No web font is loaded.** Headings use a system serif stack ending in Noto Serif for
  Android. It costs zero bytes and carries most of the character.
- **Warm paper, not screen white.** White is reserved for raised surfaces.
- Deep clinical blue, terracotta accent, light-only palette.
- **A hairline rule instead of a bordered card** wherever a card would be reflexive —
  except where a list item is an action, which must look tappable.
- Every text/background pair clears WCAG AA (4.5:1); the weakest is 5.00:1.
- **Every page renders and every form submits with JavaScript disabled.**

---

## 9. The booking flow

Four steps on one page at `/book`. **State lives in the URL, not in component state**,
which buys three things: the whole flow works with JavaScript off, the browser back
button behaves, and a half-finished booking survives a reload.

1. **What do you need?** Staged: pick one of three *kinds* of visit (see a doctor / blood
   or urine test / X-ray, scan or heart test), then a service within that kind, then a
   doctor if it is a consultation. Presenting all 38 bookable services at once was the
   single worst thing about the first version.
2. **When suits you?** The soonest free slot is offered as a one-tap shortcut. Below it a
   calendar shows each date with the number of places left; unavailable dates are visibly
   disabled. Choosing a date reveals the times.
3. **Your details.** Name, mobile, email, optional notes, and the Data Privacy Act consent
   checkbox linking to `/privacy`.
4. **Confirm.** A dialog repeats what is being booked before submitting. On success the
   reference code is shown large on screen.

**Only non-personal choices go in the URL**: kind, service, doctor, date, session, slot.
Name, mobile, email and notes are POSTed and never appear in a query string, browser
history or an access log. The reference code is rendered from the action result, not
redirected to, so it never reaches the URL either.

### Cancellation

Two ways, no login:

- **Reference code + the mobile it was booked with.** `/booking/[reference]` renders only
  a form; the booking appears once the mobile is POSTed and matches. Only the patient's
  first name is shown back, so a guessed code cannot harvest a full name. Failures never
  say which half was wrong. Rate limited, because the code is short.
- **The emailed link**, `/booking/cancel/[token]`. The token is single-purpose and sits
  in the **path**, not a query string, so it does not leak through a `Referer` header.

### The confirmation email

Sent through Resend as both plain text and HTML. Contains the reference code (leading,
because it is what the patient needs at the desk), service, doctor, date and time in
Manila, the clinic address and phone, the service's preparation instructions, and the
cancellation link.

**If the email fails, the booking still succeeds** and the screen says so explicitly:
the reference code is the part that matters. This is a stated requirement, not an
accident.

---

## 10. The admin area

### Authentication

- Sessions are **rows in `staff_sessions`**, not a self-contained signed cookie, so
  deactivating a staff member ends their access on the next request rather than in twelve
  hours.
- The cookie holds an opaque random token; what is stored is its **HMAC keyed with
  `SESSION_SECRET`**, so a database leak alone does not hand over live sessions.
- Cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production. Twelve-hour lifetime — one
  clinic day.
- Login answers **every** failure identically (unknown email, wrong password, deactivated
  account) and always runs a password verification, so an unknown address cannot be told
  apart by timing or wording. Rate limited to 10 attempts per IP per hour.
- The guard lives in `admin/(app)/layout.tsx` so `/admin/login` can render outside it.
  **Every server action also calls `requireStaff()` or `requireAdmin()` for itself** — an
  action is its own endpoint and is reachable without the protecting layout ever
  rendering.

### Screens

| Screen | Role | What it does |
|---|---|---|
| **Today** | any | The day's bookings in time order. Progress ("3 of 9 seen"), the next unseen patient marked, overdue rows tinted, a client-side filter to find whoever is at the counter, and the patient's preparation instructions shown so the desk can check them. Arrived / Did not come / Cancel. |
| **Bookings** | any | Filter by date range, doctor, service and status; search by reference, mobile or name. Filters live in the query string, so a useful view can be bookmarked and it works as a plain GET. |
| **Schedules** | any | Create and edit sessions; add closed days. **A closed day lists the patients who now need ringing, with tap-to-call numbers.** |
| **Services and prices** | any | The single price list. Search and category filter; edit in a dialog. |
| **Doctors** | any | Add, edit, deactivate. |
| **Promos** | any | Add with start and end dates; they appear and disappear by themselves. |
| **Settings** | admin | Clinic details, opening hours, booking horizon. |
| **Staff users** | admin | Accounts and roles. |
| **Waiting room screen** | any | `/admin/monitor` — the board that faces the patients. Opens in its own tab. |

Reception accounts do not see Settings or Staff users in the navigation and are
redirected away if they type the URL.

### The waiting room board

`/admin/monitor` is a full-screen board for a television in the waiting room: one panel
each for consultation, laboratory and imaging, showing who is being seen and who is
next. It sits outside the `(app)` route group so it gets the whole display with no admin
chrome, and repeats `requireStaff()` in its own layout, because the `(app)` guard does
not reach it.

**It adds no status and no new staff step.** `arrived` is written the moment the desk
taps Arrived on Today, so the arrived booking with the latest `updated_at` is the last
patient the desk moved along, and the board derives from that. A parallel queue would be
a second thing to keep in step, and it would drift.

**What a public wall is allowed to show.** The reference code — the patient's own public
identifier, already in their confirmation email, meaningless to the rest of the room —
and a name cut to "Corazon A." by `shortenName`. No surname, no mobile, no email, and no
service name, because "Chest X-ray" beside a name is a diagnosis hint. `getMonitorRows`
selects those columns and no others, so the rest cannot reach the page even inside a
prop that nothing renders. The second line is the doctor for a consultation and the
appointment time otherwise, since laboratory and imaging sessions have no doctor.

It refreshes itself every 15 seconds with `router.refresh()`, so it repaints without the
page flashing white in front of the room, and falls back to a meta refresh with
JavaScript off. Voice announcement is off by default, remembered per screen, and
announces only a change — never the call already on screen when the page loaded.

### Status changes

Every change writes a `booking_events` row naming the staff member. The allowed-from list
is enforced **in the UPDATE's WHERE clause**, not checked beforehand, so two receptionists
clicking at once cannot both write an event, and a cancelled booking can never be revived
into a slot the patient was told they had given up.

```
arrived             <- booked, no_show
no_show             <- booked, arrived
cancelled_by_clinic <- booked, arrived, no_show
```

### Deleting

Delete is offered on doctors, services, sessions, promos and staff, always behind a
confirmation that says what will happen — but it **refuses when it would break a record**:

- A service on six bookings → refused, "untick Active instead".
- A staff member who has ever changed a booking → refused, their name is on that history.
- Your own account → no delete button at all.
- A promo, which nothing references → deletes outright.

This is deliberate. A row that quietly rewrites last month's appointments is worse than a
list with an inactive entry in it.

---

## 11. Security and privacy

- **Every** server action validates with Zod before touching the database.
- Rate limiting by IP, counted in the database: bookings (6/hour), inquiries (5/hour),
  booking lookups (12/hour), cancellations (20/hour), logins (10/hour).
- Honeypot fields on the booking and inquiry forms.
- No personal data in any URL or query string.
- TLS certificate verification is **on** for the database connection.
- Passwords are scrypt with the parameters stored alongside the hash, so they can be
  raised later without invalidating existing hashes.
- The admin area is `noindex` regardless of the indexing switch below.

---

## 12. Testing

```
npm test                  # 63 tests; needs a database
npm run test:unit         # pure functions only, no database
npm run db:clear-limits   # reset rate-limit counters between browser test runs
npm run db:demo-today     # put demo bookings on today (idempotent)
```

Database tests need `TEST_DATABASE_URL` pointing at a Postgres with migrations applied and
**no seed data** — seeded sessions would otherwise appear in availability results, because
laboratory and imaging sessions are not scoped to a doctor.

Conventions that keep these honest:

- Dates are pinned in the future and `now` is injected, so nothing depends on when the
  suite runs.
- Each database test file uses its **own dates**, because a clinic-wide blackout is global
  by definition and two files blacking out the same date would sabotage each other. Files
  also run serially.
- Raw-SQL test rows generate unique reference codes and cancel tokens, since both are
  globally unique in the schema.
- **The concurrency guarantee is proved, not raced.** Two connections are driven by hand
  so the dangerous interleaving is guaranteed to occur. The "fire N bookings at once"
  tests are a smoke test on top; alone they can pass for the wrong reason.

Beyond the unit and database suites there are browser suites covering the booking flow
(with and without JavaScript), lookup and cancellation, the admin screens, the dialogs,
deleting, and an accessibility audit of every admin form.

---

## 13. Deployment and environment

Hosted on Vercel, functions pinned to `sin1` (Singapore) via `vercel.json` to match the
Neon region. Measured latency from Manila: about 54ms to Singapore against roughly 220ms
to a US region.

```
DATABASE_URL            Neon POOLED connection string (host ends -pooler)
DATABASE_URL_UNPOOLED   Direct connection; not used by the app
TEST_DATABASE_URL       An EMPTY database for npm test; never seeded
RESEND_API_KEY          Transactional email
RESEND_FROM             Must be on a domain verified in Resend
CLINIC_INBOX            Where the inquiry form is delivered
SESSION_SECRET          32+ random bytes, base64. Signs the staff session cookie.
ADMIN_SEED_EMAIL        Used only by npm run db:seed
ADMIN_SEED_PASSWORD     Used only by npm run db:seed
NEXT_PUBLIC_SITE_URL    Optional. Overrides the auto-detected production domain.
ALLOW_SEARCH_INDEXING   "true" to allow indexing. Anything else blocks it.
```

`NEXT_PUBLIC_SITE_URL` falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, which
follows a custom domain automatically. It is set explicitly here only because the
auto-assigned domain and the chosen alias are the same length, so Vercel's
"shortest domain" tie-break picked arbitrarily.

### Attaching a custom domain later

Add it in Vercel → Settings → Domains and point the DNS records Vercel shows. Then either
leave `NEXT_PUBLIC_SITE_URL` unset, so it follows the new domain automatically, or set it
explicitly if you want `www` rather than the apex. Verify the clinic's domain in Resend
and update `RESEND_FROM` at the same time, so confirmation emails stop coming from a
stand-in domain.

---

## 14. Traps worth knowing

Each of these was a real bug, found by testing. They are easy to reintroduce.

**Step 3 of booking must not depend on live availability.** The moment a booking
succeeds, its slot is taken and drops out of `computeAvailability`. Gating the form on
that list made a successful booking re-render an empty form with no reference code, so a
patient with JavaScript off booked again. `resolveChosenSlot` resolves the slot from the
URL instead; whether it is still free is decided in `createBooking`, under the lock.

**Rejected forms must be refilled.** Server actions re-render the form and wipe
uncontrolled inputs. Every failure path echoes the submitted values back, so a missed
consent tick does not cost a patient their name, mobile and email.

**An unticked checkbox sends no key at all.** Treating the field as required failed every
admin save with "expected nonoptional, received undefined". Listing `z.undefined()` in a
union is not enough; the field must be `.nullish()`.

**React bubbles `onClose` on `<dialog>`.** Without checking `event.target`, a nested
delete confirmation closing also tears down the edit dialog around it and loses whatever
was typed.

**Admin forms label by wrapping, not by `htmlFor`.** These screens repeat the same form
per row, so any id derived from a field name is duplicated down the page and `htmlFor`
points at the wrong control or none.

**Long lists need one shared dialog.** Giving each of thirty sessions its own dialog put
525KB and 442 inputs into one admin page. The shared-dialog version is 81KB.

**A blank environment variable is not an absent one.** `??` only falls back on null and
undefined, so an empty `NEXT_PUBLIC_SITE_URL` reached `new URL('')` and failed the whole
build during prerender.

**Rules not cards is right for reading and wrong for choosing.** Anywhere a list item
performs an action, it must look tappable.

---

## 15. Current state

### Done

Schema and migrations · availability engine · booking flow · confirmation email · lookup
and cancellation · staff authentication · Today screen · all admin screens · waiting
room board · deployed to Vercel.

### Placeholder — must be replaced before launch

**Everything the clinic would recognise as its own is invented demo content:**

- Address, phone numbers, email and Facebook URL
- The four doctors, their specialties, biographies and clinic days
- All 38 services and their prices
- Session times, capacities and cut-offs
- The two promos

The phone numbers in particular are plausible Philippine numbers that were made up and
could belong to somebody. **Search indexing is switched off** for exactly this reason, and
should stay off until the real details are in.

### Outstanding

1. **Local development points at the production database.** There is no separate
   development branch, so running the seed locally wipes production. Harmless while it is
   all demo data, destructive the day the clinic takes a real booking. A Neon branch fixes
   it in minutes.
2. **The privacy notice needs a named Data Protection Officer.** The National Privacy
   Commission requires one for anyone processing health data. The notice is written to
   match what the site does, but it needs the clinic's DPO reviewed and named.
3. **No photographs.** The single biggest thing that would stop the site feeling generic
   is real photos of the building, the waiting room and the doctors.
4. **Promo image upload** is a URL field, not an upload. Real upload needs a storage
   decision (Vercel Blob or Neon Object Storage) that has not been made.
5. **Emails send from a stand-in domain** until the clinic's own domain is verified in
   Resend.
6. `@neon/config` and `@neon/env` sit in runtime dependencies although only the Neon CLI
   config file uses them; they could move to devDependencies.

### Open questions for the clinic

- Are the seeded session capacities right? Dra. Reyes is currently set to nine patients in
  a three-hour morning with six bookable online.
- Should consultation fees appear on the public prices page? They are currently hidden.
- Should one booking be able to cover several laboratory tests? Today a patient needing
  CBC, urinalysis and FBS books three separate slots.
- Should slot length come from the session or the service? A 12-lead ECG and a 2D echo
  share a 30-minute imaging slot, but the echo really takes 45.
