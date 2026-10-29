'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';

import {Spinner} from '@/components/Spinner';
import {api} from '@/lib/api';

interface Settings {
  database: 'pglite' | 'postgres';
  keys: Record<string, boolean>;
}

const KEYS: {name: string; need: string; what: string; where: React.ReactNode}[] = [
  {
    name: 'DATABASE_URL',
    need: 'Required',
    what: 'Postgres connection string. Stores profiles, runs, companies, founders and drafts. Use pglite://./.data for a built-in local database with no setup.',
    where: <>Neon, Supabase or any Postgres: copy the connection string from the dashboard.</>
  },
  {
    name: 'ANTHROPIC_API_KEY',
    need: 'One AI key required',
    what: 'For profiles using Claude. Claude searches the web for each company and writes the email.',
    where: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API keys</a>
  },
  {
    name: 'OPENAI_API_KEY',
    need: 'One AI key required',
    what: 'For profiles using OpenAI models, with the web_search tool.',
    where: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com → API keys</a>
  },
  {
    name: 'GEMINI_API_KEY',
    need: 'One AI key required',
    what: 'For profiles using Gemini, with Google Search grounding.',
    where: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com → API key</a>
  },
  {
    name: 'APIFY_TOKEN',
    need: 'Optional',
    what: 'Looks up verified founder emails. Without it you get emails published on company sites plus pattern guesses (first guess right about 80% of the time).',
    where: <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noopener">console.apify.com → Settings → Integrations</a>
  }
];

const STEPS: {title: string; body: string}[] = [
  {title: 'Load the batch', body: "Reads every company in the YC batch from YC's public directory, newest launched first. A new run always starts from the top of the batch. To continue a run, press + Draft more next to it in the Runs list: it adds the next new companies to the same run (50 + 20 = 70), never repeating one."},
  {title: 'Find founders', body: "Opens each company's YC page for founder names, titles, LinkedIn/X and open roles, until it has as many companies as you asked for. \"Only companies hiring\" skips those with no open roles."},
  {title: 'Find emails', body: 'Checks the company website for published addresses, builds pattern guesses (first@, first.last@, ...) and, if Apify is on, looks up verified emails 50 founders at a time, capped at your USD limit per lookup.'},
  {title: 'Research and write', body: 'For each company, one AI call: the model searches the web for what the company builds and recent news, picks one real detail as the hook, and writes the email from your system prompt and profile Markdown. Sources are saved with the draft.'},
  {title: 'Review', body: 'Edit the recipient, subject or body, regenerate, write to another founder, copy, open in your mail app, mark sent, or export CSV.'}
];

export default function HowItWorksPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{settings: Settings}>('/settings').then((d) => setSettings(d.settings), (e) => setErr(e.message));
  }, []);

  const hasAiKey = settings && ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'].some((k) => settings.keys[k]);

  return (
    <>
      <h1>How it works</h1>
      <p className="sub">Pick a YC batch, and a run finds the founders, their emails, researches each company and drafts one personalised email per company from your own profile.</p>

      <section className="panel">
        <h2>Keys you need</h2>
        <p className="hint" style={{marginTop: 0}}>
          All of these go in <code>apps/backend/.env</code> (gitignored; copy <code>apps/backend/.env.example</code>). Restart the backend after editing it. Keys stay on the backend: they are never stored in the database or sent to this page.
        </p>
        {err ? <p className="status err">Couldn&apos;t reach the backend: {err}</p> : null}
        <table style={{marginTop: 10}}>
          <thead><tr><th>Variable</th><th>Status</th><th>Needed</th><th>What it&apos;s for</th><th>Where to get it</th></tr></thead>
          <tbody>
            {KEYS.map((k) => {
              const set = settings?.keys[k.name];
              return (
                <tr key={k.name}>
                  <td><code>{k.name}</code></td>
                  <td>{settings ? <span className={`badge ${set ? 'valid' : k.need === 'Required' ? 'failed' : 'none'}`}>{set ? 'set' : 'not set'}</span> : err ? '—' : <Spinner />}</td>
                  <td>{k.need}</td>
                  <td>{k.what}</td>
                  <td>{k.where}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {settings ? (
          <p className={`status ${hasAiKey ? 'ok' : 'err'}`}>
            {hasAiKey ? 'Ready: at least one AI key is set.' : 'Set at least one AI key before starting a run.'} Database: {settings.database === 'pglite' ? 'built-in PGlite (local files)' : 'Postgres'}.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Getting started</h2>
        <ol style={{margin: 0, paddingLeft: 20}}>
          <li>Fill in <code>apps/backend/.env</code> with the keys above, then run <code>npm run dev</code> in <code>v2/</code>.</li>
          <li><Link href="/profiles/new">Create a profile</Link>: pick the AI provider and model, paste your resume and experience as Markdown, and write the system prompt that sets the tone and structure of your emails.</li>
          <li><Link href="/runs/new">Start a run</Link>: choose the profile, a YC batch, how many companies, and the filters. Nothing runs until you press Start run.</li>
          <li>Open the run, review each draft, then copy it or open it in your mail app and mark it sent.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>What a run does</h2>
        <ol style={{margin: 0, paddingLeft: 20}}>
          {STEPS.map((s) => <li key={s.title} style={{marginBottom: 8}}><b>{s.title}.</b> {s.body}</li>)}
        </ol>
      </section>

      <section className="panel">
        <h2>Email labels</h2>
        <p className="r"><span className="badge valid">verified</span> Apify confirmed the mailbox.</p>
        <p className="r"><span className="badge unknown">unverified</span> Apify found it but couldn&apos;t confirm it. Usually right.</p>
        <p className="r"><span className="badge site">on site</span> Published on the company&apos;s website. Real, but may be a shared inbox.</p>
        <p className="r"><span className="badge guess">guess</span> Most common pattern, like first@domain. May bounce.</p>
      </section>

      <section className="panel">
        <h2>Costs and control</h2>
        <ul style={{margin: 0, paddingLeft: 20}}>
          <li>Each draft, and each regenerate, is one AI call with a few web searches, billed to your AI key.</li>
          <li>Apify lookups bill your Apify account, capped by the profile&apos;s max USD per 50 founders.</li>
          <li>Nothing paid starts by itself. Starting a run, resuming, and regenerating all ask first. A backend restart pauses unfinished runs; press Resume to continue.</li>
          <li>Edits to a profile&apos;s prompt or resume apply to the next draft or regenerate, in any run.</li>
        </ul>
      </section>
    </>
  );
}
