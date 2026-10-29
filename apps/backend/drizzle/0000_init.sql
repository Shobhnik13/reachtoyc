CREATE TYPE "public"."ai_provider" AS ENUM('anthropic', 'openai', 'gemini');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'scraping', 'enriching', 'drafting', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('pending', 'scraped', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('pending', 'generated', 'failed');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"ai_provider" "ai_provider" NOT NULL,
	"ai_model" text NOT NULL,
	"ai_key" text,
	"apify_token" text,
	"apify_max_usd" real DEFAULT 1 NOT NULL,
	"resume_markdown" text DEFAULT '' NOT NULL,
	"system_prompt" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer NOT NULL,
	"batch" text NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"company_limit" integer NOT NULL,
	"hiring_only" boolean DEFAULT false NOT NULL,
	"skip_contacted" boolean DEFAULT true NOT NULL,
	"use_apify" boolean DEFAULT false NOT NULL,
	"ai_provider" "ai_provider" NOT NULL,
	"ai_model" text NOT NULL,
	"system_prompt" text NOT NULL,
	"resume_markdown" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "companies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"batch" text NOT NULL,
	"position" integer NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"domain" text DEFAULT '' NOT NULL,
	"one_liner" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"team_size" integer,
	"linkedin" text DEFAULT '' NOT NULL,
	"twitter" text DEFAULT '' NOT NULL,
	"site_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_count" integer,
	"jobs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "company_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "founders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "founders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"linkedin" text DEFAULT '' NOT NULL,
	"twitter" text DEFAULT '' NOT NULL,
	"emails_found" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_guesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apify_checked" boolean DEFAULT false NOT NULL,
	"apify_email" text,
	"apify_status" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "drafts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"founder_id" integer,
	"to_email" text DEFAULT '' NOT NULL,
	"email_kind" text DEFAULT 'none' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"status" "draft_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founders" ADD CONSTRAINT "founders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_founder_id_founders_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_runs_profile_id" ON "runs" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_runs_status" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_companies_run_id_slug" ON "companies" USING btree ("run_id","slug");--> statement-breakpoint
CREATE INDEX "idx_companies_slug" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_companies_status" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_founders_company_id" ON "founders" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_drafts_company_id" ON "drafts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_drafts_run_id" ON "drafts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_drafts_status" ON "drafts" USING btree ("status");