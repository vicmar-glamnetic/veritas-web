# Prompt — finish the clinic queue

Paste everything below the line into Claude Code, in this repository.

Context for you, not for the prompt: the first half of this work is already committed
(`04726ff`). Reception issues numbers, staff call them, the board shows `C-014`. What
follows is the part that is still missing, plus the questions only the clinic can answer.

---

Read `CLAUDE.md`, `AGENTS.md` and `OVERVIEW.md` before writing anything. The queue is
described under "The queue and the waiting room board" in both. Follow the conventions
there rather than introducing new ones — in particular: Zod on every server action,
`requireStaff()` inside each action rather than relying on the layout, all Manila/UTC
conversion through `src/lib/time.ts`, no new dependencies, and every screen must work
with JavaScript disabled.

## What exists now

- `queue_tickets` and `queue_counters` in `src/db/schema.ts`.
- `src/lib/queue.ts` — pure: `formatTicket`, `buildQueueBoard`, `shortenName`.
- `src/lib/queue-service.ts` — takes a `Db` as its first argument, as `createBooking`
  does. Do not make it import the app singleton; the database tests would then run
  against production.
- `/admin/monitor` with Call next, walk-in and undo per category, and
  `/admin/monitor?display=1` as the wall version with no controls.
- Marking a patient Arrived on Today issues their number in the same transaction.
- Tests: `src/lib/queue.test.ts` and `src/lib/queue.db.test.ts`.

## What to build

### 1. Walk-ins are half-finished

`issueWalkInTicket` creates a ticket with no patient behind it, so the board shows a bare
number and the clinic has no record of who it was. Give reception a proper walk-in form
on the Today screen: name, mobile, category, and which service if they know it. Create
the `patients` row with `source = 'walkin'`, then the ticket.

A walk-in has no booking, so nothing in `bookings` should be invented for them. Keep the
ticket as the only record for now — `patients.merged_into_id` already exists for the day
the clinic system reconciles a walk-in with an online patient.

### 2. Rooms and counters

The board says "please proceed to Consultation", which is not enough when there are three
consultation rooms. Add a room or counter to the call, so it can say "proceed to
Consultation Room 2".

Ask the clinic how many rooms there are per category and whether a doctor is fixed to
one, because that decides whether this is a column on `sessions`, a new `rooms` table, or
simply free text typed at the point of calling. **Do not guess this one.**

### 3. Skip and recall

A number gets called and nobody stands up. Today the only options are to call the next
one — which loses the absent patient entirely — or to undo. Add:

- **Skip**: the called ticket becomes `skipped` and the queue moves on.
- **Recall**: a skipped ticket goes back into the queue, once, at the front or the back.

The `skipped` status already exists in the `queue_status` enum. Ask the clinic whether a
skipped patient goes to the front or the back, and how many times they get recalled
before they lose their place.

### 4. Per-room queues, if the clinic wants them

Right now all consultations share one queue. If each doctor runs their own list, the
board needs a column per doctor rather than one per category, and `queue_tickets` needs
a `doctor_id`. This changes the shape of the board, so settle §2 first.

### 5. A printed or displayed ticket

Reception currently reads the number out. Ask whether they want something the patient
takes away. The cheapest honest version is a print stylesheet on a small page that shows
the number, the date and the clinic name — no thermal printer integration, no new
dependency.

## Data model rules to keep

- **Never allocate a number with `max(number) + 1`.** `queue_counters` exists so that
  allocation is one atomic statement. Under concurrency `max(number) + 1` hands the same
  number to two people. `queue.db.test.ts` proves this; if you change allocation, break
  it deliberately and check the stampede test fails before you trust it.
- **Never store the formatted ticket.** `formatTicket` renders `C-014` from the category
  and the number every time.
- **A number is never reused within a day**, even if its ticket is voided. A number shown
  to a waiting room must not be handed to someone else.
- **Numbering restarts by Manila calendar day**, through `service_date`. No cron job.
- **Nothing on the public board beyond a number and a shortened name.** No surname, no
  mobile, no email, and no service name — a service name beside a name is a diagnosis
  hint under the Data Privacy Act. Keep `getQueueTickets` selecting only those columns,
  so nothing else can reach the page even inside a prop that goes unrendered.

## Tests to write

Match the existing conventions: `node --test` with `tsx`, no framework, database tests in
`*.db.test.ts` with dates pinned in the future and unique to the file.

- Unit tests for any new pure logic, including skip and recall ordering.
- A database test that two people calling at once are never handed the same number.
- A database test that a skipped patient recovers their place according to whatever rule
  the clinic chooses.
- A browser check that every new control works with JavaScript disabled, and that no
  surname, mobile number or service name appears on `/admin/monitor?display=1`.

## Ask the clinic before building

Put these to the client rather than deciding them:

1. How many rooms or counters per category, and is a doctor fixed to one?
2. Does a skipped patient go to the front or the back, and how many recalls?
3. Do walk-ins and booked patients share one number sequence per category, or should a
   walk-in be told apart on the board?
4. Should numbers restart at 001 each day, or run weekly or monthly?
5. Does the patient get something printed, or is the number read out?
6. `L-###` was written as `L-####` in one message — is laboratory really four digits, or
   was that a slip? Everything is three digits at the moment, growing past three on its
   own if a day ever needs it.

## Do not build

Reporting on waiting times, an SMS "your turn is near", a patient-facing queue page on
the public website, or anything that lets a patient see the queue from outside the
clinic. The queue is a staff tool and a screen on the wall.
