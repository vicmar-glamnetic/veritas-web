CREATE TYPE "public"."queue_status" AS ENUM('waiting', 'called', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE "queue_counters" (
	"service_date" date NOT NULL,
	"category" "service_category" NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "queue_counters_service_date_category_pk" PRIMARY KEY("service_date","category"),
	CONSTRAINT "queue_counters_last_number_non_negative" CHECK ("queue_counters"."last_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "queue_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_date" date NOT NULL,
	"category" "service_category" NOT NULL,
	"number" integer NOT NULL,
	"booking_id" uuid,
	"patient_id" uuid,
	"status" "queue_status" DEFAULT 'waiting' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"called_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"issued_by_staff_user_id" uuid,
	"called_by_staff_user_id" uuid,
	CONSTRAINT "queue_tickets_number_positive" CHECK ("queue_tickets"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_issued_by_staff_user_id_staff_users_id_fk" FOREIGN KEY ("issued_by_staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_called_by_staff_user_id_staff_users_id_fk" FOREIGN KEY ("called_by_staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "queue_tickets_number_key" ON "queue_tickets" USING btree ("service_date","category","number");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_tickets_booking_key" ON "queue_tickets" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "queue_tickets_board_idx" ON "queue_tickets" USING btree ("service_date","category","status");