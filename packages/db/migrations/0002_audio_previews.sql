CREATE TABLE "transcode_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp (3) with time zone,
	"last_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcode_jobs_track_id_unique" UNIQUE("track_id"),
	CONSTRAINT "transcode_jobs_status_check" CHECK ("transcode_jobs"."status" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "preview_key" text;--> statement-breakpoint
ALTER TABLE "transcode_jobs" ADD CONSTRAINT "transcode_jobs_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcode_jobs_claim_idx" ON "transcode_jobs" USING btree ("status","run_after");--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_preview_key_unique" UNIQUE("preview_key");