ALTER TABLE "opportunities" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "live_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "live_research_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "live_research_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "live_research_note" text;--> statement-breakpoint
ALTER TABLE "ventures" ADD COLUMN "monthly_target" numeric(16, 2);--> statement-breakpoint
UPDATE "opportunities" SET "closed_at" = "updated_at" WHERE "commercial_status" IN ('won','lost') AND "closed_at" IS NULL;