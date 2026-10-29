# reachtoyc: setup guide for AI agents

You are helping a user set up and use **reachtoyc**, a local web app that picks a Y Combinator batch, finds each
company's founders and their likely emails, researches each company with the user's AI model, and drafts one
personalised cold email per company from the user's own profile. The user reviews the drafts, then copies them or
opens them in their mail app. Nothing is sent automatically.

Repo: https://github.com/Shobhnik13/reachtoyc. Human-oriented docs: `README.md`.

## Rules for you, the agent

- **Never spend the user's money without asking.** Starting a run, "Draft more", resuming a run and regenerating a
  draft all call the user's AI provider (and Apify if set). Confirm with the user first, and say roughly how many
  companies or calls it will be.
- **Credentials go only in `apps/backend/.env`.** Never commit it (it is gitignored), never paste keys into other
  files, issues or chat summaries, and never print them back to the user.
- **Ask the user for every value below.** Don't invent keys, URLs or resume content.
- The user's resume and email instructions are stored in the app's database (profile), not in the repo. Don't write
  them into tracked files.
- After editing `apps/backend/.env`, restart the backend (`npm run dev` restarts it on file changes; otherwise stop
  and start it).

## What to collect from the user

| Value | Required | Where the user gets it | Where it goes |
|---|---|---|---|
| Database URL | Yes | Neon: neon.tech → project → **Connect** → connection string. Supabase: Project Settings → Database → connection string. Or skip and use the built-in local database. | `DATABASE_URL` in `apps/backend/.env`. Built-in local option: `DATABASE_URL=pglite://./.data` |
| AI provider key (one is enough) | Yes | Claude: https://console.anthropic.com/settings/keys · OpenAI: https://platform.openai.com/api-keys · Gemini: https://aistudio.google.com/apikey | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` in `apps/backend/.env` |
| Apify token | No (recommended for better emails) | https://console.apify.com/settings/integrations → API token | `APIFY_TOKEN` in `apps/backend/.env`. When set, every run verifies founder emails with Apify (billed to their Apify account, capped per 50 founders by the profile's max USD). |
| Their profile in Markdown | Yes | Their resume, links (portfolio, GitHub, resume PDF), every job with results and numbers, side projects with links | The app's profile (`resume_markdown`), via the UI or API below. Not a repo file. |
| How emails should read | No | Their own instructions: tone, length, structure, closing line | The profile's `system_prompt`. Leave empty to use the built-in default. |
| Subject line | No | e.g. `looking out for an engineering opportunity - would love to work as an engineer at {company}` | The profile's `subject_template`. `{company}` and `{first_name}` are filled in by code. Empty = the AI writes subjects. |
| Port | No | Only if 4100 is taken | `PORT` in `apps/backend/.env`, and `BACKEND_URL=http://127.0.0.1:<port>` in `apps/frontend/.env.local` |

Final `apps/backend/.env` looks like this (only fill what the user has):

```
DATABASE_URL=postgresql://user:password@host/db?sslmode=verify-full
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=
GEMINI_API_KEY=
APIFY_TOKEN=apify_api_...
PORT=4100
```

For Neon URLs, replace `sslmode=require` with `sslmode=verify-full` (same security, no warning from the `pg` driver).

## Setup steps

1. **Check Node 22 or newer:** `node -v`.
2. **Get the code and install:**
   ```
   git clone https://github.com/Shobhnik13/reachtoyc && cd reachtoyc
   npm install
   ```
3. **Create the env file** and fill in the values from the user:
   ```
   cp apps/backend/.env.example apps/backend/.env
   ```
4. **Start both apps** from the repo root (keep it running):
   ```
   npm run dev        # backend http://127.0.0.1:4100, frontend http://localhost:3000
   ```
   Database migrations run automatically on backend start.
5. **Verify:**
   ```
   curl -s http://127.0.0.1:4100/healthchecks          # {"code":"success",...}
   curl -s http://127.0.0.1:4100/settings              # which keys are set (booleans only) and the database type
   ```
   `settings.keys` must show `DATABASE_URL: true` and at least one AI key `true`. The user can also open
   http://localhost:3000/how-it-works to see the same status.
6. **Create the profile.** Either the user does it at http://localhost:3000/profiles/new, or you do it through the
   API. Example that reads the user's Markdown profile from a file they point you to:
   ```
   node -e '
   const fs = require("fs");
   const body = {
     name: "My profile",
     ai_provider: "anthropic",                 // or "openai" / "gemini"; must match a key in .env
     ai_model: "claude-opus-5-5",              // optional, this is the default for anthropic
     resume_markdown: fs.readFileSync(process.argv[1], "utf8"),
     subject_template: "looking out for an engineering opportunity - would love to work as an engineer at {company}"
   };
   fetch("http://127.0.0.1:4100/profiles", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)})
     .then((r) => r.json()).then((j) => console.log(j.code, j.data.profile && j.data.profile.id));
   ' /path/to/their-profile.md
   ```
   Add `system_prompt` the same way if the user has one. The response says `has_ai_key: true` when the provider's key
   is set.
7. **Start a run (ask the user first; it costs money).** Either at http://localhost:3000/runs/new, or:
   ```
   curl -s http://127.0.0.1:4100/batches                # pick a batch name, e.g. "Fall 2026"
   curl -s -X POST http://127.0.0.1:4100/runs -H 'Content-Type: application/json' \
     -d '{"profile_id": 1, "batch": "Fall 2026", "company_limit": 20, "hiring_only": false}'
   ```
   One AI call with web search per company, plus Apify lookups if `APIFY_TOKEN` is set.
8. **Review.** The user opens http://localhost:3000/runs → the run. Drafts can be edited, regenerated, switched to another
   founder, copied, opened in a mail app and marked sent.

## How to use it day to day

- **New run:** always starts from the top of the batch, newest launched companies first.
- **Draft more:** in the Runs list, **+ Draft more** next to a run adds the next N new companies of that batch to the
  same run (50 + 20 = 70), never repeating one. API: `PUT /runs/:id {"status": "queued", "add_companies": 20}`.
- **Run for a different company** (Runs page, or `POST /runs {"source": "url", "profile_id": 1, "website": "https://acme.com", "email": "optional", "contact_name": "optional"}`):
  same workflow for one non-YC company. The AI researches it, emails are found and checked with Apify, and one email is
  written. Needs the AI key and `APIFY_TOKEN` (`keys_missing` otherwise). If no email is found the draft is still
  written and the user types the address. About 2 AI calls; ask the user first.
- **Regenerate all** at the top of a run rewrites every unsent draft (one AI call each; ask the user first). API:
  `PUT /runs/:id {"status": "queued", "regenerate": true}`.
- **Regenerate** on a draft: email body only, subject only, or everything, with optional 1-2 lines of extra context.
- **switch to <founder>:** changes the recipient to another founder of the same company. No AI call.
- **Editing the profile** (resume, prompt, subject template, model) applies to the next draft or regenerate.
- **Email labels:** `verified` (Apify confirmed), `unverified` (Apify found, not confirmed, usually right),
  `on site` (published on the company website), `guess` (pattern like first@domain, right about 80% of the time).

## Where things live

| Thing | Location |
|---|---|
| Credentials | `apps/backend/.env` only |
| Profiles, runs, companies, founders, drafts | The database at `DATABASE_URL` (`profiles` table holds resume, prompt, subject template) |
| Local built-in database (if used) | `apps/backend/.data/` (gitignored) |
| Backend code | `apps/backend` (Express + Drizzle). Pipeline: `app/services/pipeline.js`; AI providers: `app/services/ai.js`; YC scraping: `app/services/yc.js` |
| Frontend code | `apps/frontend` (Next.js), proxies `/api/*` to the backend |
| Migrations | `apps/backend/drizzle/`, applied on backend start |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Frontend shows a proxy error or "Couldn't reach the backend" | Backend isn't running or crashed. Check the `npm run dev` output. |
| `EADDRINUSE` on 4100 or 3000 | Another app uses the port. Set `PORT` in `apps/backend/.env` and `BACKEND_URL` for the frontend, or free the port. |
| `profile_incomplete` when starting a run | The profile's provider key is missing in `.env` (restart the backend after adding it) or the profile has no resume. |
| A key shows `false` in `/settings` | Add it to `apps/backend/.env` and restart the backend. |
| Run says "Interrupted by a backend restart" | Ask the user, then `PUT /runs/:id {"status": "queued"}` or press Resume in the UI. |
| Neon drops idle connections | Expected; the backend logs it and reconnects on the next query. |

## API reference

All responses: `{code, error, message, data}`. Updates are `PUT`; no `DELETE`/`PATCH`.

| Route | Purpose |
|---|---|
| `GET /healthchecks` | Liveness |
| `GET /settings` | Which env keys are set (booleans only), database type |
| `GET /batches` | YC batches with company counts |
| `POST /profiles`, `GET /profiles`, `GET/PUT /profiles/:id` | `name`, `ai_provider`, `ai_model`, `resume_markdown`, `system_prompt`, `subject_template`, `apify_max_usd` |
| `POST /runs`, `GET /runs`, `GET/PUT /runs/:id` | Start (`profile_id`, `batch`, `company_limit`, `hiring_only`); `PUT` `status: canceled` / `status: queued` (+ `add_companies`) |
| `GET /companies?run_id=` | Companies with founders and draft; `statuses`, `q`, `sent`, `limit`, `offset`; returns `total` |
| `GET /drafts`, `GET/PUT /drafts/:id` | Edit `subject`, `body`, `to_email`, `sent`; `founder_id` switches recipient; `status: pending` + `part` (`all`/`body`/`subject`) + `instructions` regenerates |

The backend has no auth and listens on 127.0.0.1 only. Don't expose it publicly.

## Working on the code

- `npm test` (in-memory database, no AI or Apify calls), `npm run lint`, `npm run typecheck -w frontend`.
- After changing `apps/backend/app/models/schema.js`: `npm run db:generate -w backend`.
- Backend layering: `routes` → `controllers` → `services` → `models`. Errors are thrown as codes listed in
  `app/configs/status.js`.
- `apps/frontend/AGENTS.md` has notes about this Next.js version.
