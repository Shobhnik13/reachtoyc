'use strict';

const path = require('path');

const ENV = `${process.env.NODE_ENV || 'development'}`;

// Tests never read the real .env, so they can't touch your database or spend on your keys
ENV !== 'test' ? require('dotenv').config({path: path.join(__dirname, '..', '..', '.env'), quiet: true}) : null;

const SERVER = {
  PORT: parseInt(process.env.PORT || '4100'),
  HOST: process.env.HOST || '127.0.0.1'
};

const DATABASE = {
  URL: process.env.DATABASE_URL || (ENV === 'test' ? 'pglite://memory' : 'pglite://./.data'),
  MIGRATIONS: path.join(__dirname, '..', '..', 'drizzle')
};

const KEYS = {
  AI: {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || ''
  },
  APIFY: process.env.APIFY_TOKEN || ''
};

const CACHE = {
  TIMEOUTS: {
    META: 6 * 60 * 60
  }
};

const PIPELINE = {
  AUTOSTART: ENV !== 'test',
  SCRAPE_CONCURRENCY: 6,
  DRAFT_CONCURRENCY: 3,
  APIFY_CHUNK: 50,
  MAX_COMPANY_LIMIT: 500
};

const AI = {
  PROVIDERS: ['anthropic', 'openai', 'gemini'],
  DEFAULT_MODELS: {
    anthropic: 'claude-opus-5-5',
    openai: 'gpt-5.5',
    gemini: 'gemini-3.5-flash'
  },
  MAX_SEARCHES: 5,
  DEFAULT_SYSTEM_PROMPT: `You write short, personal cold emails from a job seeker to startup founders. The candidate's full profile is below; it is the only source of facts about the candidate.

Rules:
- 90 to 150 words in the body. Plain text, no markdown, no emojis, no bullet points.
- Open with one specific, true detail about what the company is building or recently shipped, taken from your research. No generic praise like "I love what you're building".
- Connect one or two concrete things the candidate has built or done to the company's product, stack or open roles. Prefer numbers and named projects.
- One clear ask: a short call about joining the team. If a listed open role fits, name it.
- Sign off with the candidate's first name and their two most relevant links from the profile.
- Subject line: short, lowercase, specific to the company. No clickbait.
- Never invent facts about the company or the candidate. If research finds little, use the company's one-liner.`
};

const [gapMin, gapMax] = String(process.env.SEND_GAP_SECONDS || '45-120')
  .split('-')
  .map((n) => parseInt(n));

// Sending through the user's own Gmail (SMTP + App Password). Tests use a fake transport that never sends.
const MAIL = {
  USER: process.env.GMAIL_USER || '',
  APP_PASSWORD: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
  FROM_NAME: process.env.SEND_FROM_NAME || '',
  HOST: 'smtp.gmail.com',
  PORT: 465,
  GAP_MIN_MS: (Number.isFinite(gapMin) ? gapMin : 45) * 1000,
  GAP_MAX_MS: (Number.isFinite(gapMax) ? gapMax : Number.isFinite(gapMin) ? gapMin : 120) * 1000,
  FAKE: ENV === 'test',
  AUTOSEND: ENV !== 'test'
};

module.exports = {ENV, SERVER, DATABASE, KEYS, CACHE, PIPELINE, AI, MAIL};
