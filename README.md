# PIP — Projects Intelligence Portal

An independent, AI-ready business intelligence and project discovery platform for the UAE and GCC. It runs your ventures as one operating system with:

- shared intelligence (projects, companies, contacts, sources)
- venture-specific pipelines
- specialised agents
- a workflow engine with human approval gates

> **Independence:** PIP has its own repository, database, auth, secrets and hosting. It does not use or depend on Calibro's Netlify account, storage or credentials.

---

## 1. Run it locally

**Requirements:** Node 20+ and PostgreSQL 14+ (local, Docker, or a Supabase connection string).

```bash
npm install
cp .env.example .env                # then edit DATABASE_URL and SESSION_SECRET
openssl rand -base64 48             # paste the output as SESSION_SECRET
npm run db:migrate                  # create tables
npm run db:seed                     # ventures, sectors, scoring, agents, workflow templates (no business data)
npm run admin:set -- you@example.com   # prompts for your password (hidden)
npm run dev                         # http://localhost:3000
```

Optional: `npm run db:seed-demo` loads clearly-labelled fictional DEMO records. You can remove them from Settings → Data at any time.

## 2. Architecture

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | UI and server in one repo. Server actions handle every write. |
| Database | PostgreSQL + Drizzle ORM | Relational integrity, versioned SQL migrations in `drizzle/`, `pg_trgm` for duplicate detection |
| Auth | Built-in single admin | bcrypt, HMAC-hashed session tokens, HTTP-only cookies, account lockout. No public sign-up. |
| Hosting | Vercel (independent project) + Supabase Postgres | Managed, cheap, quick to deploy |
| AI / search | Provider interfaces in `src/server/ai/providers.ts` | Not tied to one vendor; keys stay server-side only |

```
src/
  db/schema.ts              all tables (users → agents → workflows → audit log)
  lib/                      constants, field definitions, validation, normalisation, scoring
  server/
    auth*.ts                sessions, guards
    actions.ts              every server action (each starts with requireAdmin())
    entities.ts             generic validated CRUD + reference options
    research.ts             discovery runs, duplicate detection, promotion to projects
    agents/                 definitions, tool registry, approval policy, runtime (runner.ts)
    workflows/engine.ts     triggers, steps, conditions, approvals, retries, scheduler tick
    ai/providers.ts         search + AI adapters and integration status
    demo.ts / seed.ts       demo data (isolated) and base configuration
  app/(app)/…               pages; app/api/… login, logout, export, cron
```

### Data model (main tables)
- **Core records:** `projects`, `companies`, `contacts`, `opportunities`, `ventures`, `pipeline_stages`, `sectors`
- **Relationships:** `project_companies` (with a role), `project_ventures` (with a relevance note), `project_contacts`, `opportunity_contacts`
- **Research and evidence:** `discoveries`, `news_items`, `research_sessions`, and `sources`. Every source has an info status: *confirmed*, *reported*, *inferred* or *unknown*.
- **Execution:** `tasks`, `activities`
- **Automation:** `agents`, `agent_ventures`, `agent_runs`, `agent_run_steps`, `approvals`, `workflows`, `workflow_runs`, `workflow_run_logs`, `events` (outbox), `notifications`, `command_messages`
- **Safety:** `audit_log`, which keeps a JSON snapshot of every deleted record. The `is_demo` and `is_simulated` flags appear wherever relevant.

## 3. Agents, automation and approvals

- **Agents:** there are 9 (Research, Lead Generation, Outreach, Sales, Marketing, Business Development, Operations, Executive Assistant, Analytics). Each one's responsibility, instructions, rules, permitted tools, venture scope and autonomy mode can be edited in the UI.
- **Tools** live in `agents/tools.ts`:
  - *Internal* tools act on PIP's database. These are real actions.
  - *External* tools (web search, email, social) run as **SIMULATED** until their integration is connected. They say so in the logs and never fabricate results.
- **Approval policy** is defined in `agents/policy.ts`:
  - *Assist:* every action that changes data needs your approval.
  - *Automate:* internal routine actions run automatically; external ones need approval.
  - *Autonomous:* external actions are allowed only up to the agent's explicit per-run limit (default 0).
- **Workflows** can start manually, on a schedule, or from an event (e.g. *project created*, *discovery added*, *opportunity status changed*, *task overdue*, *approval decided*). Available steps:
  - condition
  - create task
  - schedule follow-up
  - notify
  - escalate
  - request approval
  - run agent
  - update field

  Failures retry with exponential backoff, then escalate. Every step is logged.
- **How work gets triggered:**
  - Events are processed as soon as they happen.
  - Schedules and retries run on `/api/cron/tick`. It is protected by `CRON_SECRET` and configured in `vercel.json`, which defaults to daily so it fits Vercel Hobby. On Pro, use `*/15 * * * *`.
  - Locally, use **Workflows → Run tick now**.
- **AI model slot:** without an AI key, agents use a transparent rule-based planner. Setting `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` adds AI-written run summaries. The tool gateway (`RunApi.call`) is the same interface a future LLM tool-use loop will call, so models can be added without a rebuild.

## 4. Testing

```bash
npm test             # 25 unit + integration tests against a separate DB (TEST_DATABASE_URL, default pip_test)
npm run test:e2e     # browser end-to-end flows (needs a running server on :3100 and Chrome)
npm run typecheck
```

Covered:
- auth, lockout and session revocation
- validation
- CRUD with relationships and safe deletes
- duplicate news and discovery detection
- discovery promotion
- agent simulation labelling and approval gates, plus the tool allow-list
- workflow events, conditions, approvals, retries and schedules
- demo-data isolation and purge
- access control on pages and APIs

## 5. Backups

- Supabase keeps daily backups.
- `npm run backup` writes a timestamped `pg_dump` to `backups/` (git-ignored). Store copies off-site.
- Restore with `psql "$DATABASE_URL" < backups/<file>.sql`.
- Settings → Data provides a JSON or CSV export.

## 6. Security notes

- Every page, action and API route checks the session on the server. Hidden menus are not used as security.
- All input is validated on the server, and SQL is parameterised.
- Secrets live only in environment variables. Nothing secret is committed (see `.gitignore`).
- Security headers block framing, MIME sniffing and search indexing.

See `docs/DEPLOYMENT.md` to go live and `docs/STATUS.md` for what works and what's next.
