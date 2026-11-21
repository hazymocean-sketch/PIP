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
1. New organization (personal) → New project `pip`. Save the database password in your password manager.
2. Click **Connect** (top bar) → **Session pooler** → copy the URI and replace `[YOUR-PASSWORD]` with your password. You only paste this into Vercel.

Migrations and base configuration run **automatically on every Vercel deploy** (`vercel-build` script), so you don't need anything installed locally.

## 3. Vercel (hosting)
1. Sign up at vercel.com with the same GitHub account → Add New → Project → import `pip`.
2. Before deploying, add these Environment Variables:
   - `DATABASE_URL`: the Supabase Session pooler link, pasted exactly as copied (leave `[YOUR-PASSWORD]` in it)
   - `DATABASE_PASSWORD`: your Supabase database password (symbols are fine)
   - `SESSION_SECRET`: a random string of 48+ characters
   - `SETUP_TOKEN`: a random string of 16+ characters (used once)
   - `CRON_SECRET`: a random string
3. Click Deploy. Then open `https://<your-app>.vercel.app/setup`, enter the SETUP_TOKEN, and create your admin login.
4. Delete `SETUP_TOKEN` in Vercel afterwards. The setup page also locks itself once an admin exists.
5. Optional, later: search and AI keys (`SEARCH_PROVIDER`, `TAVILY_API_KEY`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`), and a custom domain.

## 4. After go-live checklist
- [ ] Sign in, then sign out and confirm protected pages redirect to /login
- [ ] Settings → Integrations shows the expected connection status
- [ ] Workflows → enable the templates you want
- [ ] Settings → Data → run a full export once and keep it
- [ ] Turn on Supabase backups and point-in-time recovery if you're on a paid plan
