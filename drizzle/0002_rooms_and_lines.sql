ALTER TYPE "public"."staff_role" ADD VALUE 'doctor';--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'laboratory';--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'imaging';--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "service_category" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD COLUMN "doctor_id" uuid;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD COLUMN "recalled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD COLUMN "station_doctor_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "doctor_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms" USING btree ("name");--> statement-breakpoint
CREATE INDEX "rooms_active_idx" ON "rooms" USING btree ("is_active","category","sort_order");--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_station_doctor_id_doctors_id_fk" FOREIGN KEY ("station_doctor_id") REFERENCES "public"."doctors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queue_tickets_line_idx" ON "queue_tickets" USING btree ("service_date","category","doctor_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_tickets_room_called_key" ON "queue_tickets" USING btree ("room_id") WHERE "queue_tickets"."status" = 'called' and "queue_tickets"."room_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_doctor_key" ON "staff_users" USING btree ("doctor_id");--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_doctor_only_for_consultation" CHECK ("queue_tickets"."category" = 'consultation' or "queue_tickets"."doctor_id" is null);--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_doctor_role" CHECK (("staff_users"."role"::text = 'doctor') = ("staff_users"."doctor_id" is not null));--> statement-breakpoint
-- Tickets issued before per-doctor lines existed: put each booked consultation in its
-- doctor's line. Walk-ins stay null, which now means "first available doctor".
UPDATE "queue_tickets" t SET "doctor_id" = b."doctor_id"
  FROM "bookings" b
  WHERE t."booking_id" = b."id" AND t."category" = 'consultation' AND t."doctor_id" IS NULL;
