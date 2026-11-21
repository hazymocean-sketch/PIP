CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_name_trgm_idx ON projects USING gin (normalized_name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON companies USING gin (normalized_name gin_trgm_ops);
