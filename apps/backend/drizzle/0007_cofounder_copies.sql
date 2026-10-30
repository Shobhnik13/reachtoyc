DROP INDEX "idx_drafts_company_id";--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_parent_id_drafts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_drafts_parent_id" ON "drafts" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_drafts_company_id" ON "drafts" USING btree ("company_id") WHERE "drafts"."parent_id" is null;