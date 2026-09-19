/**
 * Veritas Clinic — database schema.
 *
 * Conventions used throughout (see CLAUDE.md):
 *
 * - Every absolute point in time is `timestamp with time zone` and is stored in UTC.
 *   Rendering into Asia/Manila happens at the edges, never in the database.
 * - Calendar dates that mean "a day on the clinic's wall calendar" (blackouts, promo
 *   windows, date of birth) are `date` in `mode: 'string'` so they can never be shifted
 *   a day by a timezone conversion.
 * - `time` columns on `sessions` are Manila wall-clock times, e.g. a Tuesday clinic that
 *   runs 09:00–12:00 local. They are combined with a date in Asia/Manila and converted to
 *   UTC by the availability engine.
 * - Primary keys are UUIDs so that nothing in the system is enumerable from a URL.
 * - Nothing is ever hard-deleted that a booking can point at; rows are deactivated.
 */

import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const patientSource = pgEnum('patient_source', ['online', 'walkin']);

export const serviceCategory = pgEnum('service_category', [
  'consultation',
  'laboratory',
  'imaging',
]);

export const bookingStatus = pgEnum('booking_status', [
  'booked',
  'cancelled_by_patient',
  'cancelled_by_clinic',
  'arrived',
  'no_show',
]);

/** Who caused a booking_events row. `staff` is qualified by actor_staff_user_id. */
export const bookingActor = pgEnum('booking_actor', ['patient', 'staff', 'system']);

export const staffRole = pgEnum('staff_role', ['admin', 'reception']);

/**
 * A queue ticket's life. `waiting` is issued but not yet called, `called` is on the
 * board right now, `done` has been seen. `skipped` is someone who did not answer when
 * their number came up; the number is never reused either way.
 */
export const queueStatus = pgEnum('queue_status', ['waiting', 'called', 'done', 'skipped']);

/** Booking statuses that still consume a seat in a slot. */
export const OCCUPYING_STATUSES = ['booked', 'arrived', 'no_show'] as const;

/* -------------------------------------------------------------------------- */
/* Patients                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A lightweight patient record. Online bookings create one of these; the clinic
 * system will later create `walkin` rows from the front desk and merge duplicates
 * by pointing the loser at the winner via `mergedIntoId`.
 *
 * `mobile` is stored normalised to E.164 (+639XXXXXXXXX) so that dedup and the
 * booking lookup can match on it exactly.
 */
export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    mobile: text('mobile').notNull(),
    // Nullable: walk-in records captured at the front desk often have no email.
    email: text('email'),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    source: patientSource('source').notNull().default('online'),
    /** Set when this record has been merged into another; null means it is live. */
    mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => patients.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('patients_mobile_idx').on(t.mobile),
    index('patients_merged_into_idx').on(t.mergedIntoId),
    check('patients_not_merged_into_self', sql`${t.mergedIntoId} is null or ${t.mergedIntoId} <> ${t.id}`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Doctors                                                                    */
/* -------------------------------------------------------------------------- */

export const doctors = pgTable(
  'doctors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    specialty: text('specialty').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    photoUrl: text('photo_url'),
    bio: text('bio'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('doctors_active_idx').on(t.isActive, t.sortOrder)],
);

/* -------------------------------------------------------------------------- */
/* Services — the single price list                                           */
/* -------------------------------------------------------------------------- */

/**
 * One row per thing the clinic sells. This is the only price list in the system:
 * the public /prices page reads it, and the cashier module will read it later.
 *
 * `pricePhp` is `numeric(10,2)` — exact decimal pesos, never a float. Drizzle
 * hands it back as a string; format it with the helper in src/lib/money.ts.
 */
export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: serviceCategory('category').notNull(),
    pricePhp: numeric('price_php', { precision: 10, scale: 2 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    /** Can a patient pick this on /book? */
    isBookableOnline: boolean('is_bookable_online').notNull().default(false),
    /** Does it appear on the public /prices page? */
    isListedOnline: boolean('is_listed_online').notNull().default(true),
    /** e.g. "Fasting for 8 hours required." Repeated in the confirmation email. */
    prepInstructions: text('prep_instructions'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('services_category_idx').on(t.category, t.sortOrder),
    index('services_listed_idx').on(t.isListedOnline),
    check('services_price_non_negative', sql`${t.pricePhp} >= 0`),
    check('services_duration_positive', sql`${t.durationMinutes} > 0`),
  ],
);

/** Which doctors can deliver which consultation services. */
export const serviceDoctors = pgTable(
  'service_doctors',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.serviceId, t.doctorId] }),
    index('service_doctors_doctor_idx').on(t.doctorId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Sessions — recurring clinic session templates                              */
/* -------------------------------------------------------------------------- */

/**
 * A recurring weekly block of clinic time, e.g. "Dr. Santos, Tuesdays 09:00–12:00,
 * 20-minute slots, 9 seats of which 6 bookable online".
 *
 * NOTE: this table is the *clinic* sense of "session". Staff login sessions live in
 * `staff_sessions`.
 *
 * `capacity` is how many patients the session takes in total, across all of its slots,
 * NOT per slot. `onlineCapacity` is how many of those places the booking form may give
 * away; the difference is held back for walk-ins. The availability engine spreads
 * `onlineCapacity` across the slots, which is what gives each slot its own limit.
 *
 * `dayOfWeek` is 0 = Sunday .. 6 = Saturday, matching both JS `getDay()` and
 * Postgres `extract(dow)`.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for laboratory and imaging sessions, which are not doctor-specific. */
    doctorId: uuid('doctor_id').references(() => doctors.id, { onDelete: 'restrict' }),
    serviceCategory: serviceCategory('service_category').notNull(),
    dayOfWeek: smallint('day_of_week').notNull(),
    /** Manila wall-clock. */
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    slotMinutes: integer('slot_minutes').notNull(),
    /** Total patients per occurrence of this session, across all slots. */
    capacity: integer('capacity').notNull(),
    /** How many of `capacity` the booking form may give away. The rest are walk-in. */
    onlineCapacity: integer('online_capacity').notNull(),
    /** A slot closes to online booking this many hours before it starts. */
    bookingCutoffHours: integer('booking_cutoff_hours').notNull().default(2),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_lookup_idx').on(t.serviceCategory, t.dayOfWeek, t.isActive),
    index('sessions_doctor_idx').on(t.doctorId),
    check('sessions_day_of_week_range', sql`${t.dayOfWeek} between 0 and 6`),
    check('sessions_end_after_start', sql`${t.endTime} > ${t.startTime}`),
    check('sessions_slot_minutes_positive', sql`${t.slotMinutes} > 0`),
    check('sessions_capacity_positive', sql`${t.capacity} > 0`),
    check(
      'sessions_online_capacity_within_capacity',
      sql`${t.onlineCapacity} >= 0 and ${t.onlineCapacity} <= ${t.capacity}`,
    ),
    check('sessions_cutoff_non_negative', sql`${t.bookingCutoffHours} >= 0`),
    // A consultation session must name a doctor; lab/imaging must not.
    check(
      'sessions_doctor_matches_category',
      sql`(${t.serviceCategory} = 'consultation' and ${t.doctorId} is not null)
          or (${t.serviceCategory} <> 'consultation' and ${t.doctorId} is null)`,
    ),
  ],
);

/**
 * Blocks a single calendar date. Exactly one of the following shapes:
 *   - sessionId set  → that one recurring session does not run that day
 *   - doctorId set   → that doctor is away, all of their sessions are blocked
 *   - both null      → clinic-wide closure (public holiday, fumigation, typhoon)
 */
export const sessionBlackouts = pgTable(
  'session_blackouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id').references(() => doctors.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('session_blackouts_date_idx').on(t.date),
    index('session_blackouts_session_idx').on(t.sessionId, t.date),
    index('session_blackouts_doctor_idx').on(t.doctorId, t.date),
    check(
      'session_blackouts_single_target',
      sql`num_nonnulls(${t.sessionId}, ${t.doctorId}) <= 1`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One appointment.
 *
 * Capacity safety: `slotIndex` is the seat number within a slot, 0-based. The partial
 * unique index below makes it impossible for two live bookings to hold the same seat
 * of the same slot, so two people racing for the last seat cannot both win — the
 * loser's INSERT fails on the constraint. Cancelled bookings drop out of the index
 * and release their seat. Application code only ever assigns a seat where
 * slotIndex < sessions.onlineCapacity.
 *
 * `referenceCode` (VRT-7K4Q) is what the patient quotes; `cancelToken` is a secret
 * that only appears in the emailed cancellation link and does nothing else.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referenceCode: text('reference_code').notNull(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    doctorId: uuid('doctor_id').references(() => doctors.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    /** UTC. Render in Asia/Manila. */
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }).notNull(),
    /** Seat number within the slot, 0-based. See the partial unique index. */
    slotIndex: integer('slot_index').notNull(),
    status: bookingStatus('status').notNull().default('booked'),
    notes: text('notes'),
    /** Data Privacy Act consent. Never null — the form cannot submit without it. */
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
    cancelToken: text('cancel_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_reference_code_key').on(t.referenceCode),
    uniqueIndex('bookings_cancel_token_key').on(t.cancelToken),
    // The concurrency guard. Only live bookings occupy a seat.
    uniqueIndex('bookings_slot_seat_key')
      .on(t.sessionId, t.scheduledStart, t.slotIndex)
      .where(sql`status in ('booked', 'arrived', 'no_show')`),
    index('bookings_scheduled_start_idx').on(t.scheduledStart),
    index('bookings_status_start_idx').on(t.status, t.scheduledStart),
    index('bookings_patient_idx').on(t.patientId),
    index('bookings_doctor_start_idx').on(t.doctorId, t.scheduledStart),
    index('bookings_service_idx').on(t.serviceId),
    check('bookings_slot_index_non_negative', sql`${t.slotIndex} >= 0`),
    check('bookings_end_after_start', sql`${t.scheduledEnd} > ${t.scheduledStart}`),
  ],
);

/**
 * Append-only audit log. Every status change writes one row, including the initial
 * creation (fromStatus null → 'booked'). Rows are never updated or deleted.
 */
export const bookingEvents = pgTable(
  'booking_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    /** Null on the creation event. */
    fromStatus: bookingStatus('from_status'),
    toStatus: bookingStatus('to_status').notNull(),
    actor: bookingActor('actor').notNull(),
    /** Set when actor = 'staff'. Renders as "staff:<name>" in the admin UI. */
    actorStaffUserId: uuid('actor_staff_user_id').references(() => staffUsers.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('booking_events_booking_idx').on(t.bookingId, t.createdAt),
    check(
      'booking_events_staff_actor_has_user',
      sql`(${t.actor} = 'staff') = (${t.actorStaffUserId} is not null)`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Promos                                                                     */
/* -------------------------------------------------------------------------- */

/** Shown on /promos while active and within [startsOn, endsOn] in Manila time. */
export const promos = pgTable(
  'promos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    imageUrl: text('image_url'),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('promos_window_idx').on(t.isActive, t.startsOn, t.endsOn),
    check('promos_ends_on_or_after_starts_on', sql`${t.endsOn} >= ${t.startsOn}`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

/** Email is stored lower-cased; the unique index below is the login key. */
export const staffUsers = pgTable(
  'staff_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    /** scrypt, from node:crypto. No third-party auth provider. */
    passwordHash: text('password_hash').notNull(),
    role: staffRole('role').notNull().default('reception'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_users_email_key').on(t.email)],
);

/**
 * Server-side record of a logged-in admin. The HTTP-only cookie carries an opaque
 * token; only its hash is stored here, so a database leak does not hand over live
 * sessions. Deactivating a staff member can revoke every session they hold.
 */
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staff_sessions_token_hash_key').on(t.tokenHash),
    index('staff_sessions_user_idx').on(t.staffUserId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Site settings — single row                                                 */
/* -------------------------------------------------------------------------- */

/** Exactly one row, id = 1, enforced by the check constraint. */
export const siteSettings = pgTable(
  'site_settings',
  {
    id: smallint('id').primaryKey().default(1),
    clinicName: text('clinic_name').notNull(),
    address: text('address').notNull(),
    phonePrimary: text('phone_primary').notNull(),
    phoneSecondary: text('phone_secondary'),
    email: text('email').notNull(),
    facebookUrl: text('facebook_url'),
    openingHoursText: text('opening_hours_text').notNull(),
    mapEmbedUrl: text('map_embed_url'),
    /** How many days ahead /book will offer. */
    bookingHorizonDays: integer('booking_horizon_days').notNull().default(30),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('site_settings_singleton', sql`${t.id} = 1`),
    check('site_settings_horizon_range', sql`${t.bookingHorizonDays} between 1 and 180`),
  ],
);

/* -------------------------------------------------------------------------- */
/* The queue                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One row per (clinic day, category), holding the last number handed out.
 *
 * This exists so a number can be allocated in a single atomic statement:
 *
 *   insert into queue_counters (...) values (..., 1)
 *   on conflict (service_date, category)
 *   do update set last_number = queue_counters.last_number + 1
 *   returning last_number
 *
 * Postgres takes the row lock for us, so two receptionists pressing Arrived at the same
 * moment get 14 and 15, never 14 twice. Reading `max(number)` from the tickets table and
 * adding one is the version of this that looks right and is not: both would read 13.
 *
 * The counter never goes backwards. A voided ticket burns its number, which is correct —
 * a queue number that has been shown to the room must never be handed to someone else.
 */
export const queueCounters = pgTable(
  'queue_counters',
  {
    /** Manila calendar date, so numbering restarts by itself each clinic day. */
    serviceDate: date('service_date', { mode: 'string' }).notNull(),
    category: serviceCategory('category').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.serviceDate, t.category] }),
    check('queue_counters_last_number_non_negative', sql`${t.lastNumber} >= 0`),
  ],
);

/**
 * A place in the queue, created at reception.
 *
 * This is the clinic's order of service, and it is deliberately not derived from
 * anything. The board used to infer "now serving" from whichever booking was most
 * recently marked arrived, which made it show the last person to walk through the door
 * rather than the person actually in front of a doctor.
 *
 * `bookingId` is null for a walk-in, who has a place in the queue but no appointment.
 * `patientId` is null when reception has not identified them yet — a number can be
 * handed out before a name is taken.
 *
 * The displayed ticket ("C-014") is never stored. It is rendered from `category` and
 * `number` by `formatTicket` in src/lib/queue.ts, so ordering and uniqueness stay
 * numeric and a change of format cannot orphan old rows.
 */
export const queueTickets = pgTable(
  'queue_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Manila calendar date. Numbers are unique within a day and category, not forever. */
    serviceDate: date('service_date', { mode: 'string' }).notNull(),
    category: serviceCategory('category').notNull(),
    /** 1-based, from queue_counters. Rendered as C-001 / L-001 / I-001. */
    number: integer('number').notNull(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'restrict' }),
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }),
    status: queueStatus('status').notNull().default('waiting'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    calledAt: timestamp('called_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    issuedByStaffUserId: uuid('issued_by_staff_user_id').references(() => staffUsers.id, {
      onDelete: 'restrict',
    }),
    calledByStaffUserId: uuid('called_by_staff_user_id').references(() => staffUsers.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    // The backstop behind queue_counters: even if allocation were got wrong, two
    // patients can never hold the same number on the same day in the same category.
    uniqueIndex('queue_tickets_number_key').on(t.serviceDate, t.category, t.number),
    // One ticket per booking. Nulls are distinct in Postgres, so walk-ins are unaffected.
    uniqueIndex('queue_tickets_booking_key').on(t.bookingId),
    index('queue_tickets_board_idx').on(t.serviceDate, t.category, t.status),
    check('queue_tickets_number_positive', sql`${t.number} > 0`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fixed-window counter keyed by "<action>:<ip>". In-memory counters do not survive
 * Vercel's serverless instances, so this lives in the database. Old rows are cleared
 * opportunistically on write.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rate_limits_window_idx').on(t.windowStart)],
);
