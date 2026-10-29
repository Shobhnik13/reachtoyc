import Link from 'next/link';

import GitHubStar from '@/components/GitHubStar';
import Reveal from '@/components/Reveal';
import StartCta from '@/components/StartCta';
import {REPO_URL} from '@/lib/repo';

const STEPS = [
  {n: '01', title: 'Pick a batch', body: 'Any YC batch, from the latest back to 2005. Choose how many companies, or only the ones hiring.'},
  {n: '02', title: 'Find the founders', body: 'Names, roles, LinkedIn and open jobs from YC, with emails from company sites, smart guesses and optional Apify verification.'},
  {n: '03', title: 'Research and write', body: 'Your own AI model reads up on each company and writes one personal email from your resume and your rules.'},
  {n: '04', title: 'Review and send', body: 'Edit, regenerate, switch founder, copy or open in your mail app. Nothing goes out without you.'}
];

const FEATURES = [
  {title: 'Your keys, your machine', body: 'Runs locally. API keys live in one .env file and never leave your backend.'},
  {title: 'Claude, OpenAI or Gemini', body: 'Bring whichever model you like; each one researches with its own web search.'},
  {title: 'Emails you can trust', body: 'Every address is labelled verified, unverified, on site or guess, so you know before you send.'},
  {title: 'Built for iterating', body: 'Regenerate the subject, the body or everything, with a line of extra context. Draft more anytime.'},
  {title: 'Your voice, not a template', body: 'A Markdown profile and a system prompt decide what gets said and how it sounds.'},
  {title: 'Agent-ready setup', body: 'Hand the repo to Claude Code or Codex: AGENTS.md walks them through every key and step.'}
];

const EMAIL = [
  'hey jon,',
  "i'm shobhnik, a backend leaning engineer, currently at xane ai. you're building motors for drones and robots, and i'd love to build the software side with you.",
  'portfolio: shobhnik.site · resume: resume.shobhnik.site',
  "what i've built:",
  '- 30+ node agentic pipeline, 800k+ listings closed',
  '- edi engine, 20k+ claim files, 166% revenue increase',
  'can we have a quick 10 min call?'
];

export default function LandingPage() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-grid" aria-hidden />
        <Reveal>
          <p className="eyebrow"><span className="dot" />open source · runs on your machine</p>
        </Reveal>
        <Reveal delay={80}>
          <h1>Cold emails to YC founders, researched and written for you.</h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="lede">
            Pick a batch. reachtoyc finds every founder and their email, reads up on each company with your own AI, and drafts one personal email per company from your resume. You review it and hit send.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="cta">
            <StartCta className="btn primary lg" />
            <GitHubStar size="lg" />
          </div>
        </Reveal>
        <Reveal delay={320}>
          <code className="install">git clone {REPO_URL.replace('https://', '')} &amp;&amp; npm i &amp;&amp; npm run dev</code>
        </Reveal>
      </section>

      <Reveal delay={200} className="preview-wrap">
        <div className="preview" aria-label="Example of a run and a drafted email">
          <div className="preview-bar">
            <span /><span /><span />
            <p>Run #2 · Fall 2026</p>
          </div>
          <div className="preview-body">
            <div className="preview-row">
              <span className="badge drafting">drafting</span>
              <span className="muted">Researching companies and writing emails…</span>
            </div>
            <div className="preview-progress"><div /></div>
            <div className="preview-stats">
              <span><b>100</b>companies</span>
              <span><b>92</b>drafts</span>
              <span><b>44</b>verified</span>
            </div>
            <div className="preview-mail">
              <div className="preview-to">
                <span className="muted">To</span> jon@acme.dev <span className="badge valid">verified</span>
              </div>
              <div className="preview-to">
                <span className="muted">Subject</span> looking out for an engineering opportunity - would love to work as an engineer at acme
              </div>
              <div className="preview-lines">
                {EMAIL.map((line, i) => (
                  <p key={i} style={{animationDelay: `${1.2 + i * 0.35}s`}}>{line}</p>
                ))}
                <span className="caret" style={{animationDelay: `${1.2 + EMAIL.length * 0.35}s`}} />
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <section className="section">
        <Reveal><h2>How it works</h2></Reveal>
        <div className="steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <div className="step">
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section">
        <Reveal><h2>Why it&apos;s different</h2></Reveal>
        <div className="features">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="feature">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section final">
        <Reveal>
          <h2>Start your first run in five minutes.</h2>
          <p className="lede">Clone it, add one AI key, paste your resume. Free and open source.</p>
          <div className="cta">
            <StartCta className="btn primary lg" setupLabel="Set it up →" appLabel="Your runs →" />
            <a className="btn lg" href={`${REPO_URL}/blob/main/AGENTS.md`} target="_blank" rel="noopener noreferrer">Setup guide for AI agents</a>
          </div>
        </Reveal>
      </section>

      <footer className="landing-foot">
        <span><span className="logo sm" aria-hidden>r</span> reachtoyc · MIT</span>
        <span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a> · <Link href="/how-it-works">How it works</Link>
        </span>
      </footer>
    </div>
  );
}
