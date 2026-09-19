CREATE TYPE "public"."booking_actor" AS ENUM('patient', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('booked', 'cancelled_by_patient', 'cancelled_by_clinic', 'arrived', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."patient_source" AS ENUM('online', 'walkin');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('consultation', 'laboratory', 'imaging');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'reception');--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"actor" "booking_actor" NOT NULL,
	"actor_staff_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_events_staff_actor_has_user" CHECK (("booking_events"."actor" = 'staff') = ("booking_events"."actor_staff_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_code" text NOT NULL,
	"patient_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"doctor_id" uuid,
	"session_id" uuid NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"slot_index" integer NOT NULL,
	"status" "booking_status" DEFAULT 'booked' NOT NULL,
	"notes" text,
	"consent_at" timestamp with time zone NOT NULL,
	"cancel_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_slot_index_non_negative" CHECK ("bookings"."slot_index" >= 0),
	CONSTRAINT "bookings_end_after_start" CHECK ("bookings"."scheduled_end" > "bookings"."scheduled_start")
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"specialty" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"photo_url" text,
	"bio" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text,
	"date_of_birth" date,
	"source" "patient_source" DEFAULT 'online' NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_not_merged_into_self" CHECK ("patients"."merged_into_id" is null or "patients"."merged_into_id" <> "patients"."id")
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"image_url" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promos_ends_on_or_after_starts_on" CHECK ("promos"."ends_on" >= "promos"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_doctors" (
	"service_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	CONSTRAINT "service_doctors_service_id_doctor_id_pk" PRIMARY KEY("service_id","doctor_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "service_category" NOT NULL,
	"price_php" numeric(10, 2) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"is_bookable_online" boolean DEFAULT false NOT NULL,
	"is_listed_online" boolean DEFAULT true NOT NULL,
	"prep_instructions" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_price_non_negative" CHECK ("services"."price_php" >= 0),
	CONSTRAINT "services_duration_positive" CHECK ("services"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "session_blackouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"doctor_id" uuid,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_blackouts_single_target" CHECK (num_nonnulls("session_blackouts"."session_id", "session_blackouts"."doctor_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid,
	"service_category" "service_category" NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"slot_minutes" integer NOT NULL,
	"capacity" integer NOT NULL,
	"online_capacity" integer NOT NULL,
	"booking_cutoff_hours" integer DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_day_of_week_range" CHECK ("sessions"."day_of_week" between 0 and 6),
	CONSTRAINT "sessions_end_after_start" CHECK ("sessions"."end_time" > "sessions"."start_time"),
	CONSTRAINT "sessions_slot_minutes_positive" CHECK ("sessions"."slot_minutes" > 0),
	CONSTRAINT "sessions_capacity_positive" CHECK ("sessions"."capacity" > 0),
	CONSTRAINT "sessions_online_capacity_within_capacity" CHECK ("sessions"."online_capacity" >= 0 and "sessions"."online_capacity" <= "sessions"."capacity"),
	CONSTRAINT "sessions_cutoff_non_negative" CHECK ("sessions"."booking_cutoff_hours" >= 0),
	CONSTRAINT "sessions_doctor_matches_category" CHECK (("sessions"."service_category" = 'consultation' and "sessions"."doctor_id" is not null)
          or ("sessions"."service_category" <> 'consultation' and "sessions"."doctor_id" is null))
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"clinic_name" text NOT NULL,
	"address" text NOT NULL,
	"phone_primary" text NOT NULL,
	"phone_secondary" text,
	"email" text NOT NULL,
	"facebook_url" text,
	"opening_hours_text" text NOT NULL,
	"map_embed_url" text,
	"booking_horizon_days" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_singleton" CHECK ("site_settings"."id" = 1),
	CONSTRAINT "site_settings_horizon_range" CHECK ("site_settings"."booking_horizon_days" between 1 and 180)
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" DEFAULT 'reception' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_staff_user_id_staff_users_id_fk" FOREIGN KEY ("actor_staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_merged_into_id_patients_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_doctors" ADD CONSTRAINT "service_doctors_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_doctors" ADD CONSTRAINT "service_doctors_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blackouts" ADD CONSTRAINT "session_blackouts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blackouts" ADD CONSTRAINT "session_blackouts_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_reference_code_key" ON "bookings" USING btree ("reference_code");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_cancel_token_key" ON "bookings" USING btree ("cancel_token");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_slot_seat_key" ON "bookings" USING btree ("session_id","scheduled_start","slot_index") WHERE status in ('booked', 'arrived', 'no_show');--> statement-breakpoint
CREATE INDEX "bookings_scheduled_start_idx" ON "bookings" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "bookings_status_start_idx" ON "bookings" USING btree ("status","scheduled_start");--> statement-breakpoint
CREATE INDEX "bookings_patient_idx" ON "bookings" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "bookings_doctor_start_idx" ON "bookings" USING btree ("doctor_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "bookings_service_idx" ON "bookings" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "doctors_active_idx" ON "doctors" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "patients_mobile_idx" ON "patients" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "patients_merged_into_idx" ON "patients" USING btree ("merged_into_id");--> statement-breakpoint
CREATE INDEX "promos_window_idx" ON "promos" USING btree ("is_active","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "service_doctors_doctor_idx" ON "service_doctors" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category","sort_order");--> statement-breakpoint
CREATE INDEX "services_listed_idx" ON "services" USING btree ("is_listed_online");--> statement-breakpoint
CREATE INDEX "session_blackouts_date_idx" ON "session_blackouts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "session_blackouts_session_idx" ON "session_blackouts" USING btree ("session_id","date");--> statement-breakpoint
CREATE INDEX "session_blackouts_doctor_idx" ON "session_blackouts" USING btree ("doctor_id","date");--> statement-breakpoint
CREATE INDEX "sessions_lookup_idx" ON "sessions" USING btree ("service_category","day_of_week","is_active");--> statement-breakpoint
CREATE INDEX "sessions_doctor_idx" ON "sessions" USING btree ("doctor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_sessions_user_idx" ON "staff_sessions" USING btree ("staff_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users" USING btree ("email");