CREATE TABLE "contact_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"company_id" uuid,
	"company_role" text,
	"lusha_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"job_title" text,
	"seniority" text,
	"departments" jsonb,
	"company_name" text,
	"linkedin" text,
	"available" jsonb,
	"reveal_credits" integer,
	"status" text DEFAULT 'suggested' NOT NULL,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "lusha_id" text;--> statement-breakpoint
ALTER TABLE "contact_candidates" ADD CONSTRAINT "contact_candidates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_candidates" ADD CONSTRAINT "contact_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_candidates" ADD CONSTRAINT "contact_candidates_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_project_lusha_uq" ON "contact_candidates" USING btree ("project_id","lusha_id");