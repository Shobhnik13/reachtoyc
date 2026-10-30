'use strict';

const {sql} = require('drizzle-orm');
const {boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex} = require('drizzle-orm/pg-core');

const aiProvider = pgEnum('ai_provider', ['anthropic', 'openai', 'gemini']);
const runStatus = pgEnum('run_status', ['queued', 'scraping', 'enriching', 'drafting', 'completed', 'failed', 'canceled']);
const companyStatus = pgEnum('company_status', ['pending', 'scraped', 'skipped', 'failed']);
const draftStatus = pgEnum('draft_status', ['pending', 'generated', 'failed']);
const runSource = pgEnum('run_source', ['yc', 'url']);
const sendStatus = pgEnum('send_status', ['unsent', 'queued', 'sending', 'sent', 'failed']);
const sendJobStatus = pgEnum('send_job_status', ['pending', 'preparing', 'ready', 'failed', 'canceled']);

const base = () => ({
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  updated_at: timestamp('updated_at', {withTimezone: true}),
  deleted_at: timestamp('deleted_at', {withTimezone: true})
});

const profiles = pgTable('profiles', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  ai_provider: aiProvider('ai_provider').notNull(),
  ai_model: text('ai_model').notNull(),
  apify_max_usd: real('apify_max_usd').notNull().default(1),
  resume_markdown: text('resume_markdown').notNull().default(''),
  system_prompt: text('system_prompt').notNull(),
  subject_template: text('subject_template').notNull().default(''),
  daily_send_limit: integer('daily_send_limit').notNull().default(30),
  ...base()
});

const runs = pgTable(
  'runs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    profile_id: integer('profile_id')
      .notNull()
      .references(() => profiles.id),
    batch: text('batch').notNull(),
    source: runSource('source').notNull().default('yc'),
    status: runStatus('status').notNull().default('queued'),
    company_limit: integer('company_limit').notNull(),
    hiring_only: boolean('hiring_only').notNull().default(false),
    skip_contacted: boolean('skip_contacted').notNull().default(false),
    use_apify: boolean('use_apify').notNull().default(false),
    ai_provider: aiProvider('ai_provider').notNull(),
    ai_model: text('ai_model').notNull(),
    system_prompt: text('system_prompt').notNull(),
    resume_markdown: text('resume_markdown').notNull(),
    error: text('error'),
    send_paused: boolean('send_paused').notNull().default(false),
    started_at: timestamp('started_at', {withTimezone: true}),
    finished_at: timestamp('finished_at', {withTimezone: true}),
    ...base()
  },
  (t) => [index('idx_runs_profile_id').on(t.profile_id), index('idx_runs_status').on(t.status)]
);

const companies = pgTable(
  'companies',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    run_id: integer('run_id')
      .notNull()
      .references(() => runs.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    batch: text('batch').notNull(),
    position: integer('position').notNull(),
    website: text('website').notNull().default(''),
    domain: text('domain').notNull().default(''),
    one_liner: text('one_liner').notNull().default(''),
    industry: text('industry').notNull().default(''),
    team_size: integer('team_size'),
    linkedin: text('linkedin').notNull().default(''),
    twitter: text('twitter').notNull().default(''),
    site_emails: jsonb('site_emails').notNull().default([]),
    job_count: integer('job_count'),
    jobs: jsonb('jobs').notNull().default([]),
    status: companyStatus('status').notNull().default('pending'),
    error: text('error'),
    ...base()
  },
  (t) => [uniqueIndex('idx_companies_run_id_slug').on(t.run_id, t.slug), index('idx_companies_slug').on(t.slug), index('idx_companies_status').on(t.status)]
);

const founders = pgTable(
  'founders',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    title: text('title').notNull().default(''),
    linkedin: text('linkedin').notNull().default(''),
    twitter: text('twitter').notNull().default(''),
    emails_found: jsonb('emails_found').notNull().default([]),
    email_guesses: jsonb('email_guesses').notNull().default([]),
    manual_email: text('manual_email'),
    apify_checked: boolean('apify_checked').notNull().default(false),
    apify_email: text('apify_email'),
    apify_status: text('apify_status'),
    ...base()
  },
  (t) => [index('idx_founders_company_id').on(t.company_id)]
);

// A "Send all" request: created instantly, prepared in the background, then its drafts go through the send queue
const sendJobs = pgTable(
  'send_jobs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    run_id: integer('run_id')
      .notNull()
      .references(() => runs.id),
    include_guesses: boolean('include_guesses').notNull().default(false),
    include_cofounders: boolean('include_cofounders').notNull().default(false),
    status: sendJobStatus('status').notNull().default('pending'),
    total: integer('total').notNull().default(0),
    over_limit: integer('over_limit').notNull().default(0),
    error: text('error'),
    started_at: timestamp('started_at', {withTimezone: true}),
    finished_at: timestamp('finished_at', {withTimezone: true}),
    ...base()
  },
  (t) => [index('idx_send_jobs_run_id').on(t.run_id), index('idx_send_jobs_status').on(t.status)]
);

const drafts = pgTable(
  'drafts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    run_id: integer('run_id')
      .notNull()
      .references(() => runs.id),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    founder_id: integer('founder_id').references(() => founders.id),
    // Set on a co-founder copy: same email as the main draft, with that co-founder's name in the greeting
    parent_id: integer('parent_id').references(() => drafts.id),
    to_email: text('to_email').notNull().default(''),
    email_kind: text('email_kind').notNull().default('none'),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull().default(''),
    hook: text('hook').notNull().default(''),
    sources: jsonb('sources').notNull().default([]),
    model: text('model').notNull().default(''),
    status: draftStatus('status').notNull().default('pending'),
    error: text('error'),
    sent: boolean('sent').notNull().default(false),
    sent_at: timestamp('sent_at', {withTimezone: true}),
    send_status: sendStatus('send_status').notNull().default('unsent'),
    send_now: boolean('send_now').notNull().default(false),
    queued_at: timestamp('queued_at', {withTimezone: true}),
    message_id: text('message_id'),
    send_error: text('send_error'),
    send_job_id: integer('send_job_id').references(() => sendJobs.id),
    ...base()
  },
  (t) => [
    uniqueIndex('idx_drafts_company_id')
      .on(t.company_id)
      .where(sql`${t.parent_id} is null`),
    index('idx_drafts_parent_id').on(t.parent_id),
    index('idx_drafts_run_id').on(t.run_id),
    index('idx_drafts_status').on(t.status)
  ]
);

module.exports = {aiProvider, runStatus, companyStatus, draftStatus, runSource, sendStatus, sendJobStatus, sendJobs, profiles, runs, companies, founders, drafts};
