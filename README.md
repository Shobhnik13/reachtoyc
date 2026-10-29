# reachtoyc

Pick a YC batch and start a **run**. The run finds every company's founders and their likely emails, researches each
company on the web with your AI model, and writes one personalised cold email per company from your own profile and
system prompt. You review the drafts, edit them, then copy them or open them in your mail app.

```
apps/backend   Express + Drizzle ORM (Postgres or embedded PGlite) and the run pipeline
apps/frontend  Next.js app; proxies /api/* to the backend
apps/landing   Landing page as plain HTML/CSS/JS (no build), deployable anywhere
```

## Set up with an AI agent

Using Claude Code, Codex or another coding agent? Point it at [`AGENTS.md`](AGENTS.md): it lists every value to ask
you for, where you get each key, that they all go in `apps/backend/.env`, the setup and verification commands, and how
to create your profile. Agents working in this repo read `AGENTS.md` / `CLAUDE.md` automatically, and the running app
serves the same guide at http://localhost:3000/llms.txt and `/setup.md`. A ready-to-paste prompt is on the app's
**How it works** page.

## Run it locally

You need Node 22 or newer, a Postgres database (or none, see `pglite` below) and an API key for one AI provider.

1. **Install**

   ```
   git clone https://github.com/Shobhnik13/reachtoyc && cd reachtoyc
   npm install
   ```

2. **Add your keys.** Copy the example file and fill it in:

   ```
   cp apps/backend/.env.example apps/backend/.env
   ```

   | Variable | Needed | What it's for |
   |---|---|---|
   | `DATABASE_URL` | Yes | Postgres connection string (Neon, Supabase, local...). Use `pglite://./.data` for a built-in local database with no setup. |
   | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | One of them | The provider your profile uses. It researches each company and writes the email. |
   | `APIFY_TOKEN` | Optional | Verified founder email lookups. |
   | `PORT` | Optional | Backend port, default `4100`. The frontend reads `BACKEND_URL` (default `http://127.0.0.1:4100`). |

   All credentials live only in `apps/backend/.env`, which is gitignored. They are never stored in the database or
   sent to the browser. The **How it works** page in the app shows which ones are set.

3. **Start both apps**

   ```
   npm run dev        # backend on :4100, frontend on :3000
   ```

   Database migrations (`apps/backend/drizzle/`) run automatically when the backend starts.

4. **Create a profile** at http://localhost:3000/profiles/new:
   - **AI provider and model** (default `claude-opus-5-5`; OpenAI and Gemini also work).
   - **Your profile in Markdown**: resume, links, every job, side projects, numbers. It's the only source of facts
     the AI may use about you. You can paste it or upload a `.md` file.
   - **Subject line template**, e.g.
     `looking out for an engineering opportunity - would love to work as an engineer at {company}`.
     `{company}` and `{first_name}` are filled in by code, so every subject comes out exactly like that.
     Leave it empty to let the AI write subjects.
   - **System prompt**: tone, length and structure of the email. Leave it empty to start from the default.

5. **Start a run** at http://localhost:3000/runs/new: pick the profile, a YC batch, how many companies, and the
   options. Nothing starts (and nothing is billed) until you press **Start run** and confirm.

6. **Review** on the run page (http://localhost:3000/runs): edit, regenerate, switch founder, copy or open in your mail app, and mark sent.

## How it works

### Where the data comes from

| Step | Source | Key | Cost |
|---|---|---|---|
| Companies in a batch | YC's public company directory (the search ycombinator.com itself uses) | none | free |
| Founders, titles, LinkedIn/X, open roles | Each company's ycombinator.com page | none | free |
| Emails published on the company site | Homepage and `/contact`, `/about`, `/team` pages | none | free |
| Pattern guesses | `first@`, `first.last@`, `flast@`, `firstlast@` built from the name and domain | none | free |
| Verified emails (automatic when `APIFY_TOKEN` is set) | Apify actor [`email-finder-by-name-and-domain`](https://apify.com/snipercoder/email-finder-by-name-and-domain) | `APIFY_TOKEN` | your Apify account, capped per lookup |
| Company research and the email itself | Your AI model with its built-in web search | AI key | your AI account |

The AI key never looks for emails or companies; Apify never writes anything.

Each draft shows where its address came from:

| Label | Meaning | How reliable |
|---|---|---|
| `verified` | Apify confirmed the mailbox | Checked |
| `unverified` | Apify found it but couldn't confirm it | Usually right |
| `on site` | Published on the company's website | Real, may be a shared inbox |
| `guess` | Most common pattern | First guess right about 80% of the time (checked against 151 Apify-verified founder emails; the right address was in the guess list 93% of the time) |

With Apify on, most drafts get a `verified` or `unverified` address and only the rest fall back to guesses.

### What a run does

1. **Load the batch.** Every company in the batch, newest launched first. A new run always starts from the top,
   whatever earlier runs did. To continue a run instead, press **+ Draft more** next to it in the Runs list and pick a number: the
   same run drafts that many more new companies from the batch (50 drafted + 20 more = 70 in that run), never
   repeating one it already has.
2. **Find founders.** Reads YC pages until it has as many companies as you asked for. **Only companies hiring** skips
   companies with no open roles on YC.
3. **Find emails.** Site emails and guesses for everyone, plus Apify lookups in groups of 50 founders whenever
   `APIFY_TOKEN` is set. An Apify failure doesn't stop the run.
4. **Research and write.** One AI call per company: the model searches the web for what the company builds and
   recent news, and writes the email from your system prompt and profile. The prompt and profile are a stable prefix,
   so providers cache them across companies.
5. **Review.** Everything happens on the run page (below).

Runs execute inside the backend process. A backend restart never restarts paid work by itself: unfinished runs and
regenerations are marked interrupted, and you press **Resume** or **Regenerate**. A resumed run continues where it
stopped and retries failed companies and drafts.

### Any other company (not YC)

**Run for a different company** on the Runs page takes a company website (plus, optionally, a contact name and their
email) and runs the same workflow for that one company. It needs the AI key and `APIFY_TOKEN`.

1. Your AI model researches the company with web search: name, what it builds, founders or CEO/CTO, LinkedIn, open
   roles.
2. Emails from the company site and pattern guesses, then Apify verification (skipped for an email you entered).
3. One email written with your profile, system prompt and subject template.

An email you entered is used as is and labelled `you entered`. If no email turns up, the email is still written and
you type the address in **To**. The result is a normal one-company run with the same buttons (regenerate, copy, open
in mail app, mark sent). Only public `http(s)` websites are accepted. API: `POST /runs` with
`{"source": "url", "profile_id", "website", "email"?, "contact_name"?}`.

### Reviewing drafts

- The run page loads 10 drafts and loads 10 more as you scroll. Search, the Drafts / Skipped filter and **hide sent**
  run on the server, so they cover the whole run.
- **To / Subject / Body** are editable; **Save edits** stores them.
- **switch to <founder>** changes the recipient to another founder of the same company: their address goes into To
  and the greeting name is swapped. No AI call.
- **✦ Regenerate** opens a panel with an optional 1-2 line context for the AI (e.g. "lead with the agentic pipeline")
  and three options, each one AI call:
  - **Regenerate email**: new body; the current subject is kept and given as context.
  - **Regenerate subject**: new subject from the current body, no web search. With a subject template it's filled
    instantly with no AI call.
  - **Regenerate all**: fresh research and a full rewrite (with context, it revises the previous draft).
  If a partial regenerate fails, the existing email stays as it was.
- **✦ Regenerate all (N)** at the top of a run rewrites every unsent draft of the run with your current profile
  prompt (N AI calls; sent drafts are left alone; Cancel stops it midway).
- **Copy body / subject / email**, **Open in mail app** (`mailto:`), **Mark sent**, and **Export CSV** (every draft
  matching the current filters).
- Profile edits (prompt, resume, subject template, model) apply to the next draft or regenerate, in any run.
- Buttons are coloured by what they do: black/white for main actions, amber for anything that calls the AI, green
  for sent, blue for saving, red for stopping a run.

The app has a light and a dark theme (toggle at the top right; the first visit follows your system setting),
toast notifications for every action, and loaders on every request.

### Where your data lives

- **Profiles, runs, companies, founders and drafts:** in your database (`DATABASE_URL`). Your resume, system prompt and
  subject template are in the `profiles` table; edit them in the app at `/profiles/<id>`.
- **Keys:** only in `apps/backend/.env`.
- **Nothing personal is in this repo.** `.env`, `.data/` (PGlite), `node_modules` and `.next` are gitignored.

## API

Every response uses the envelope `{code, error, message, data}`. Updates are `PUT`; there are no `DELETE` or `PATCH`
routes (send `active: 0` to soft-delete a profile).

| Route | |
|---|---|
| `GET /batches` | YC batches with company counts |
| `GET /settings` | Which env keys are set (booleans only) and the database type |
| `POST /profiles`, `GET /profiles`, `GET/PUT /profiles/:id` | `name`, `ai_provider`, `ai_model`, `resume_markdown`, `system_prompt`, `subject_template`, `apify_max_usd`; responses report whether the provider's env key is set |
| `POST /runs`, `GET /runs`, `GET/PUT /runs/:id` | Start with `profile_id`, `batch`, `company_limit`, `hiring_only` (Apify is used when `APIFY_TOKEN` is set). `PUT` with `status: canceled` stops a run, `status: queued` resumes it, `status: queued` plus `add_companies: N` drafts N more new companies in the same run, and `status: queued` plus `regenerate: true` rewrites every unsent draft |
| `GET /companies?run_id=` | Companies with nested `founders` and `draft`. Filters: `statuses`, `q`, `sent`, `limit`, `offset`; returns `total` |
| `GET /drafts`, `GET/PUT /drafts/:id` | Edit `subject`, `body`, `to_email`, `sent`; `founder_id` switches recipient; `status: pending` with `part` (`all`, `body`, `subject`) and optional `instructions` regenerates |

## Development

```
npm test                        # node:test on an in-memory PGlite; never reads .env, makes no AI or Apify calls
npm run lint                    # eslint for the backend
npm run typecheck -w frontend   # tsc for the frontend
npm run db:generate -w backend  # new migration after editing apps/backend/app/models/schema.js
npm run landing                 # serve apps/landing on http://localhost:3001 (plain static files)
```

`apps/landing` is plain `index.html` + `styles.css` + `script.js` (+ `favicon.svg`, `llms.txt`). Open the file directly
or host the folder on any static host (GitHub Pages, Netlify, Vercel with root directory `apps/landing`).

Backend layout: `routes` → `controllers` (input parsing) → `services` (logic, the run pipeline in
`services/pipeline.js`, providers in `services/ai.js`, YC scraping in `services/yc.js`) → `models` (Drizzle queries).

## Troubleshooting

- **Frontend shows "Couldn't reach the backend" or a proxy error:** the backend isn't running or crashed. Check the
  `npm run dev` output. Another app on port 4100? Set `PORT` in `apps/backend/.env` and `BACKEND_URL` for the frontend.
- **A key shows "not set" on How it works:** add it to `apps/backend/.env` and restart the backend.
- **Hosted Postgres drops idle connections** (Neon does): the backend logs it and reconnects on the next query.
  Use `sslmode=verify-full` in the URL to silence the `pg` SSL-mode warning.
- **Run stopped with "Interrupted by a backend restart":** press **Resume** on the run page.

## Notes

- No auth: the backend listens on 127.0.0.1 only. Don't expose it to the internet as is.
- Everything from YC and the web is untrusted. The prompt tells the model to treat it as data, and the UI only links
  `http(s)` URLs.
- Write to people one at a time, keep it short, and take "no" for an answer.

## License

MIT
