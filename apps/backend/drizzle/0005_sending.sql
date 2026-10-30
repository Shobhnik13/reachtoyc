CREATE TYPE "public"."send_status" AS ENUM('unsent', 'queued', 'sending', 'sent', 'failed');--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "send_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "send_status" "send_status" DEFAULT 'unsent' NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "send_now" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "send_error" text;