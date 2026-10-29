# reachtoyc

Pick a YC batch and start a **run**. The run finds every company's founders and their likely emails, researches each
company on the web with your AI model, and writes one personalised cold email per company from your own profile and
system prompt. You review the drafts, edit them, then copy them or open them in your mail app.

```
apps/backend   Express + Drizzle (Postgres or PGlite), the run pipeline
apps/frontend  Next.js app; proxies /api/* to the backend
```

## Setup

Node 22+.

```
git clone https://github.com/Shobhnik13/reachtoyc && cd reachtoyc
npm install
cp apps/backend/.env.example apps/backend/.env    # then fill it in
npm run dev                                       # backend :4100, frontend :3000
```

Open http://localhost:3000, create a profile (provider, model, resume Markdown, system prompt), then start a run.

All credentials live in `apps/backend/.env` (gitignored). None are stored in the database or sent to the browser.

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Postgres URL (Neon, Supabase, ...). `pglite://./.data` runs an embedded Postgres with no setup. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | The provider your profile uses. |
| `APIFY_TOKEN` | Optional verified-email lookups. |
| `PORT` | Backend port, default 4100. The frontend reads `BACKEND_URL` (default `http://127.0.0.1:4100`). |

Migrations in `apps/backend/drizzle/` run automatically when the backend starts. After changing
`app/models/schema.js`, run `npm run db:generate -w backend`.

## What a run does

1. **Scrape.** Loads the batch from YC's public directory (newest launched first) and reads each company's YC page
   for founders, LinkedIn/X and open roles, until it has `company_limit` qualifying companies. **Hiring only** skips
   companies with no open roles. **Skip companies drafted in earlier runs** (on by default) leaves out every company that already has a draft, so a second run on the same batch continues with new companies.
2. **Find emails.** Addresses published on the company site, pattern guesses (`first@`, `first.last@`, ...), and,
   if Apify is enabled for the run, verified lookups through the
   [`email-finder-by-name-and-domain`](https://apify.com/snipercoder/email-finder-by-name-and-domain) actor, 50
   founders per actor run, capped at the profile's USD limit. An Apify failure doesn't stop the run.
3. **Research and write.** For each company, one call to your model with its built-in web search (Claude
   `web_search`, OpenAI `web_search`, Gemini Google Search grounding). The system prompt and resume form a stable
   prefix, so providers cache them across companies. The model returns subject, body and the hook it used, and the
   sources it searched are saved with the draft.
4. **Review.** Edit the recipient, subject or body, regenerate a draft, write to a different founder, copy, open
   in your mail app, mark sent, or export CSV.

Runs execute in the backend process. Nothing paid starts on its own: a backend restart marks unfinished runs and
regenerations as interrupted, and you press **Resume** or **Regenerate**. Each stage only touches unfinished rows, so
a resumed run picks up where it stopped. **Cancel** stops a run; **Retry failed** retries failed companies and
drafts. Drafts always use the profile's current prompt, resume and model, so edits apply to the next regenerate.

## API

JSON envelope on every response: `{code, error, message, data}`. Updates are `PUT`; there are no `DELETE` or `PATCH`
routes (set `active: 0` to soft-delete a profile).

| Route | |
|---|---|
| `GET /batches` | YC batches with company counts |
| `GET /settings` | Which env keys are set (booleans only) and the database type |
| `POST/GET /profiles`, `GET/PUT /profiles/:id` | Provider, model, resume, prompt. Reports which env keys are set. |
| `POST/GET /runs`, `GET/PUT /runs/:id` | Start (`profile_id`, `batch`, `company_limit`, `hiring_only`, `skip_contacted`, `use_apify`), list, cancel (`status: canceled`), resume (`status: queued`) |
| `GET /companies?run_id=` | Companies with nested `founders` and `draft` |
| `GET /drafts`, `GET/PUT /drafts/:id` | Edit `subject`/`body`/`to_email`, `sent`, `founder_id`; `status: pending` regenerates |

## Tests

```
npm test    # node:test against an in-memory PGlite; never reads .env, makes no AI or Apify calls
npm run lint
```

## Notes

- No auth: the backend listens on 127.0.0.1 only. Don't expose it to the internet as is.
- Everything from YC and the web is untrusted. The prompt tells the model to treat it as data, and the UI only
  links `http(s)` URLs.
- Write to people one at a time, keep it short, and take "no" for an answer.
