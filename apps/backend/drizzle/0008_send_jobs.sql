CREATE TYPE "public"."send_job_status" AS ENUM('pending', 'preparing', 'ready', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "send_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "send_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"include_guesses" boolean DEFAULT false NOT NULL,
	"include_cofounders" boolean DEFAULT false NOT NULL,
	"status" "send_job_status" DEFAULT 'pending' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"over_limit" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "send_job_id" integer;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_send_jobs_run_id" ON "send_jobs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_send_jobs_status" ON "send_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_send_job_id_send_jobs_id_fk" FOREIGN KEY ("send_job_id") REFERENCES "public"."send_jobs"("id") ON DELETE no action ON UPDATE no action;