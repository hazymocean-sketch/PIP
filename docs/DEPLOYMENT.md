# Deploying PIP (independent accounts)

Everything below goes in **your own new accounts**. Secrets go into the provider dashboards. Never put them in chat, code or Git.

## 1. GitHub (source control)
1. Create a **private** repository named `pip` under your personal GitHub account.
2. Push this code, either yourself or by connecting the repo to Claude:
   ```bash
   git remote add origin git@github.com:<you>/pip.git
   git push -u origin main
   ```

## 2. Supabase (database)
1. Create a new Supabase project (region: e.g. *Middle East* or *Central EU*) and save its database password in your password manager.
2. Go to Project Settings → Database → Connection string, and copy the **Session pooler** URI (port 5432).
3. From your machine, run:
   ```bash
   DATABASE_URL="<supabase uri>" npm run db:migrate
   DATABASE_URL="<supabase uri>" npm run db:seed
   DATABASE_URL="<supabase uri>" SESSION_SECRET="<same as Vercel>" npm run admin:set -- you@example.com
   ```
   `pg_trgm` is enabled by the migration. Supabase supports it.

*PIP only uses Supabase as Postgres today. Supabase Auth and Storage can be added later without schema changes to existing tables.*

## 3. Vercel (hosting)
1. Create a new Vercel project → Import the `pip` GitHub repo. The framework is detected as Next.js.
2. Add these Environment Variables (Production):
   - `DATABASE_URL`: the Supabase pooler URI
   - `SESSION_SECRET`: output of `openssl rand -base64 48`
   - `CRON_SECRET`: another random string (Vercel Cron sends it automatically)
   - Optional, when ready: `SEARCH_PROVIDER`, `TAVILY_API_KEY` / `BRAVE_SEARCH_API_KEY`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`
3. Deploy, then sign in with the admin account you created.
4. Optional: add your domain under Vercel → Domains.

## 4. After go-live checklist
- [ ] Sign in, then sign out and confirm protected pages redirect to /login
- [ ] Settings → Integrations shows the expected connection status
- [ ] Workflows → enable the templates you want
- [ ] Settings → Data → run a full export once and keep it
- [ ] Turn on Supabase backups and point-in-time recovery if you're on a paid plan
