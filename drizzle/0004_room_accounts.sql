ALTER TYPE "public"."staff_role" ADD VALUE 'room';--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_room_key" ON "staff_users" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_room_role" CHECK (("staff_users"."role"::text = 'room') = ("staff_users"."room_id" is not null));