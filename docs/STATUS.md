# PIP — Status (Stage 1 checkpoint, 22 Nov 2026)

## Working and tested
| Area | Status |
|---|---|
| Independent foundation | Own repo, own Postgres schema with migrations, `.env`-based secrets, no Calibro dependency |
| Authentication | Single admin, bcrypt, HMAC'd session tokens, 7-day sessions, lockout after 5 failures, sign out everywhere, password change |
| Access control | Every page, action and API route checks the session on the server. Unauthenticated users and forged cookies are redirected or get 401 (tested). |
| Navigation and design | All 15 sections render (55 routes crawled). Dark, compact design. Responsive down to 390px with a slide-out nav. |
| Overview dashboard | Counted live from the DB. Shows a clear empty state when there's no data. |
| Projects | Full CRUD with all brief fields, Unknown handling, stakeholder companies by role, multiple ventures each with a relevance note, contacts, opportunities, sources, research, tasks, activities, weighted scoring, duplicate warnings |
| Companies / Contacts / Opportunities | CRUD plus relations. Each venture has its own pipeline stages and board view. Decision-makers are linked contacts. |
| Sources and evidence | URL, source, published and accessed dates, extracted info, which fact it supports, and info status (confirmed / reported / inferred / unknown) |
| News & Updates | CRUD with filters by date, sector, location, developer, category and relevance. Duplicate URLs are blocked after normalisation. |
| Discoveries | Hotels & resorts pilot runs (8 queries), manual search links, manual add, duplicate detection (URL plus name similarity), save as project with the source attached, link to an existing project, flag, reject |
| Research Center | Structured sessions for each research type, with per-question answers and an evidence basis, a report, sources and findings. Completing one updates the project and logs an activity. |
| Tasks / Activities | CRUD, overdue views, quick complete, links to any record |
| Agents (9) | Editable config, tool allow-list, venture scope, three autonomy modes with limits, run history, step-by-step logs |
| Approvals | Queue with risk level, email preview, approve or reject, execution result. Simulated actions are flagged before you approve. |
| Workflow engine | Manual, schedule and event triggers; conditions; 8 step types; approval pause and resume; retries with backoff; failure escalation; logs; protected cron endpoint |
| Command Centre | Natural-language console with rule-based routing, quick runs, approvals, activity, insights computed from real data, agent performance, notifications |
| Reports | Sector, location, stage, status, venture, discovery trend, research activity, conversion rates. Only real data is shown. |
| Settings | Profile and security, venture profiles (services, clients, acquisition, qualification, agent instructions, pipeline stages), sectors, editable scoring weights, integrations status, export (JSON/CSV), backups, demo load and purge |
| Demo data | Fictional, `[DEMO]`-prefixed, flagged and badged. Removing it is one step. |
| Tests | 25 unit and integration tests, 16 browser E2E flows, a full page crawl, and desktop and mobile screenshots |

## Simulated / not yet connected (clearly labelled in the app)
- **Web/news search:** the Tavily and Brave adapters are written but **untested** and need an API key. Until then, discovery runs in manual mode.
- **AI model:** the Anthropic adapter is written but **untested**. Agents currently use the rule-based planner, and AI is only used for summaries when connected.
- **Email / LinkedIn / social sending:** not built. Approved sends are recorded as SIMULATED.
- **Calendar, file storage and the Calibro CRM bridge:** deferred by design.

## Not done yet (next stages)
1. Deploy: GitHub repo, then Supabase, then Vercel. This needs your accounts (see DEPLOYMENT.md).
2. Connect a search provider and run the first live hotels & resorts discovery.
3. Connect an AI model and move the agents from the rule-based planner to a tool-use loop through the existing gateway.
4. Automated daily news monitoring (scheduled workflow + search + dedupe).
5. A visual workflow builder (steps are edited as JSON today).
6. File attachments (private Supabase Storage).
7. Multi-user roles, email integration, the Calibro CRM API bridge.
