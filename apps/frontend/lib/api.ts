export type Provider = 'anthropic' | 'openai' | 'gemini';
export type RunStatus = 'queued' | 'scraping' | 'enriching' | 'drafting' | 'completed' | 'failed' | 'canceled';

export interface Profile {
  id: number;
  name: string;
  ai_provider: Provider;
  ai_model: string;
  apify_max_usd: number;
  resume_markdown: string;
  system_prompt: string;
  subject_template: string;
  daily_send_limit: number;
  has_ai_key: boolean;
  ai_key_env: string;
  has_apify_token: boolean;
  created_at: string;
}

export interface Run {
  id: number;
  profile_id: number;
  profile_name: string;
  batch: string;
  source: 'yc' | 'url';
  status: RunStatus;
  company_limit: number;
  hiring_only: boolean;
  skip_contacted: boolean;
  use_apify: boolean;
  ai_provider: Provider;
  ai_model: string;
  system_prompt: string;
  resume_chars: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  stats: {
    companies: {pending: number; scraped: number; skipped: number; failed: number};
    drafts: {pending: number; generated: number; failed: number; sent: number};
    send: {unsent: number; queued: number; sending: number; sent: number; failed: number};
    ready: Partial<Record<EmailKind, number>>;
  };
  send_paused: boolean;
  daily_send_limit: number;
  send_job?: SendJob | null;
}

export interface SendJob {
  id: number;
  status: 'pending' | 'preparing' | 'ready' | 'failed' | 'canceled';
  total: number;
  over_limit: number;
  error: string | null;
  include_guesses: boolean;
  include_cofounders: boolean;
  created_at: string;
  progress: {queued: number; sending: number; sent: number; failed: number; unsent: number};
}

export interface MailStatus {
  configured: boolean;
  phase: 'idle' | 'waiting' | 'sending';
  next_at: string | null;
  sent_today: number;
  queued: number;
  daily_limit: number;
  from: string | null;
}

export interface Settings {
  database: 'pglite' | 'postgres';
  keys: Record<string, boolean>;
  mail: MailStatus;
}

export interface Founder {
  id: number;
  name: string;
  title: string;
  linkedin: string;
  twitter: string;
  emails_found: string[];
  email_guesses: string[];
  manual_email: string | null;
  apify_checked: boolean;
  apify_email: string | null;
  apify_status: string | null;
}

export interface Draft {
  id: number;
  run_id: number;
  company_id: number;
  founder_id: number | null;
  to_email: string;
  email_kind: EmailKind;
  subject: string;
  body: string;
  hook: string;
  sources: {url: string; title: string}[];
  model: string;
  status: 'pending' | 'generated' | 'failed';
  error: string | null;
  sent: boolean;
  sent_at: string | null;
  send_status: 'unsent' | 'queued' | 'sending' | 'sent' | 'failed';
  send_now: boolean;
  message_id: string | null;
  send_error: string | null;
  company?: {name: string; slug: string; batch: string};
}

export interface Company {
  id: number;
  run_id: number;
  slug: string;
  name: string;
  batch: string;
  website: string;
  domain: string;
  one_liner: string;
  industry: string;
  team_size: number | null;
  linkedin: string;
  twitter: string;
  site_emails: string[];
  job_count: number | null;
  jobs: {title: string; url: string}[];
  status: 'pending' | 'scraped' | 'skipped' | 'failed';
  error: string | null;
  founders: Founder[];
  draft: Draft | null;
  copies: {id: number; founder_id: number | null; to_email: string; send_status: Draft['send_status']; sent: boolean; send_error: string | null}[];
}

export type EmailKind = 'manual' | 'valid' | 'unknown' | 'site' | 'guess' | 'none';

export const EMAIL_LABEL: Record<EmailKind, string> = {manual: 'you entered', valid: 'verified', unknown: 'unverified', site: 'on site', guess: 'guess', none: 'no email'};

export const ACTIVE: RunStatus[] = ['queued', 'scraping', 'enriching', 'drafting'];

// Above this many emails a day from a personal Gmail, spam filters start to notice
export const SAFE_DAILY_SENDS = 50;

export const DEFAULT_MODELS: Record<Provider, string> = {anthropic: 'claude-opus-5-5', openai: 'gpt-5.5', gemini: 'gemini-3.5-flash'};

// In-flight request count drives the top loading bar; polling passes silent so the bar doesn't flash
let inflight = 0;
const listeners = new Set<(n: number) => void>();

export function onLoading(fn: (n: number) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function track(delta: number) {
  inflight += delta;
  listeners.forEach((fn) => fn(inflight));
}

export async function api<T>(path: string, init?: {method?: string; body?: unknown; silent?: boolean}): Promise<T> {
  if (!init?.silent) track(1);

  try {
    const res = await fetch(`/api${path}`, {
      method: init?.method || 'GET',
      headers: init?.body ? {'Content-Type': 'application/json'} : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store'
    });
    const json = await res.json().catch(() => ({error: true, message: `HTTP ${res.status}`}));

    if (json.error) {
      throw new Error(json.message || `HTTP ${res.status}`);
    }

    return json.data as T;
  } finally {
    if (!init?.silent) track(-1);
  }
}

export function bestEmail(f: Founder): {email: string; kind: EmailKind} {
  if (f.manual_email) return {email: f.manual_email, kind: 'manual'};
  if (f.apify_email) return {email: f.apify_email, kind: f.apify_status === 'valid' ? 'valid' : 'unknown'};
  if (f.emails_found?.length) return {email: f.emails_found[0], kind: 'site'};
  if (f.email_guesses?.length) return {email: f.email_guesses[0], kind: 'guess'};
  return {email: '', kind: 'none'};
}

// Same rule as the backend: replace the old recipient's first name in the greeting line only, keeping its casing
export function swapGreeting(body: string, oldName: string, newName: string) {
  const oldFirst = oldName.trim().split(/\s+/)[0];
  const newFirst = newName.trim().split(/\s+/)[0];
  if (!body || !oldFirst || !newFirst) return body;
  const lines = body.split('\n');
  const escaped = oldFirst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  lines[0] = lines[0].replace(new RegExp(`\\b${escaped}\\b`, 'i'), (m) => (m === m.toLowerCase() ? newFirst.toLowerCase() : newFirst));
  return lines.join('\n');
}

export const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : undefined);

export function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}) : '';
}
