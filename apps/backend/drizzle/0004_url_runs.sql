CREATE TYPE "public"."run_source" AS ENUM('yc', 'url');--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "source" "run_source" DEFAULT 'yc' NOT NULL;--> statement-breakpoint
ALTER TABLE "founders" ADD COLUMN "manual_email" text;