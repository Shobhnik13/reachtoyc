'use strict';

const {and, asc, desc, eq, gte, inArray, isNotNull, isNull} = require('drizzle-orm');

const utilsService = require('app/services/utils');

const {companies, drafts, runs} = require('app/models/schema');

const database = require('app/configs/database');

// One draft per company: a regenerate overwrites the row instead of adding one
async function createDraft(params) {
  if (!params.runId || !params.companyId) {
    throw new Error('input_missing');
  }

  let _insert = {run_id: params.runId, company_id: params.companyId, status: 'pending'};

  let result = await database
    .db()
    .insert(drafts)
    .values(_insert)
    .onConflictDoUpdate({target: drafts.company_id, targetWhere: isNull(drafts.parent_id), set: {status: 'pending', error: null, updated_at: new Date()}})
    .returning({id: drafts.id});

  return result[0].id;
}

async function getDrafts(params) {
  let filters = [eq(drafts.active, true)];
  params.includeCopies ? null : filters.push(isNull(drafts.parent_id));
  params.runId ? filters.push(eq(drafts.run_id, params.runId)) : null;
  params.statuses ? filters.push(inArray(drafts.status, params.statuses)) : null;
  params.sendStatuses ? filters.push(inArray(drafts.send_status, params.sendStatuses)) : null;
  params.hasOwnProperty('sent') ? filters.push(eq(drafts.sent, params.sent)) : null;

  let result = await database
    .db()
    .select({draft: drafts, company_name: companies.name, company_slug: companies.slug, company_batch: companies.batch})
    .from(drafts)
    .innerJoin(companies, eq(companies.id, drafts.company_id))
    .where(and(...filters))
    .orderBy(desc(drafts.id));

  return utilsService.sanitizeSqlResult(result).map(_collate);
}

async function getDraft(params) {
  if (!params.draftId && !params.companyId) {
    throw new Error('input_missing');
  }

  let filters = [eq(drafts.active, true)];
  params.draftId ? filters.push(eq(drafts.id, params.draftId)) : null;
  params.companyId ? filters.push(eq(drafts.company_id, params.companyId), isNull(drafts.parent_id)) : null;

  let result = await database
    .db()
    .select({draft: drafts, company_name: companies.name, company_slug: companies.slug, company_batch: companies.batch})
    .from(drafts)
    .innerJoin(companies, eq(companies.id, drafts.company_id))
    .where(and(...filters));

  return result.length ? _collate(utilsService.sanitizeSqlResult(result[0])) : null;
}

// Companies of a batch already drafted (sent or not) in any run, so rerunning the batch continues with new ones
async function getDraftedSlugs(params) {
  if (!params.batch) {
    throw new Error('input_missing');
  }

  let result = await database
    .db()
    .selectDistinct({slug: companies.slug})
    .from(drafts)
    .innerJoin(companies, eq(companies.id, drafts.company_id))
    .where(and(eq(companies.batch, params.batch), inArray(drafts.status, ['generated', 'pending']), eq(drafts.active, true)));

  return result.map((r) => r.slug);
}

async function updateDraft(params) {
  if (!params.draftId) {
    throw new Error('input_missing');
  }

  let _update = {updated_at: new Date()};
  params.status ? (_update.status = params.status) : null;
  params.hasOwnProperty('error') ? (_update.error = params.error) : null;
  params.hasOwnProperty('founderId') ? (_update.founder_id = params.founderId) : null;
  params.hasOwnProperty('toEmail') ? (_update.to_email = params.toEmail) : null;
  params.hasOwnProperty('emailKind') ? (_update.email_kind = params.emailKind) : null;
  params.hasOwnProperty('subject') ? (_update.subject = params.subject) : null;
  params.hasOwnProperty('body') ? (_update.body = params.body) : null;
  params.hasOwnProperty('hook') ? (_update.hook = params.hook) : null;
  params.sources ? (_update.sources = params.sources) : null;
  params.hasOwnProperty('model') ? (_update.model = params.model) : null;
  params.sendStatus ? (_update.send_status = params.sendStatus) : null;
  params.hasOwnProperty('sendNow') ? (_update.send_now = params.sendNow) : null;
  params.hasOwnProperty('queuedAt') ? (_update.queued_at = params.queuedAt) : null;
  params.hasOwnProperty('messageId') ? (_update.message_id = params.messageId) : null;
  params.hasOwnProperty('sendError') ? (_update.send_error = params.sendError) : null;
  params.hasOwnProperty('sendJobId') ? (_update.send_job_id = params.sendJobId) : null;

  if (params.hasOwnProperty('sent')) {
    _update.sent = params.sent;
    _update.sent_at = params.sent ? new Date() : null;
  }

  await database.db().update(drafts).set(_update).where(eq(drafts.id, params.draftId));
}

// A co-founder copy of a main draft; reuses the copy for that person if one exists
async function createCopy(params) {
  if (!params.parentId || !params.runId || !params.companyId || !params.founderId) {
    throw new Error('input_missing');
  }

  let existing = await database
    .db()
    .select({id: drafts.id})
    .from(drafts)
    .where(and(eq(drafts.parent_id, params.parentId), eq(drafts.founder_id, params.founderId)));

  let values = {
    to_email: params.toEmail,
    email_kind: params.emailKind,
    subject: params.subject,
    body: params.body,
    model: params.model || '',
    status: 'generated',
    updated_at: new Date()
  };

  if (existing.length) {
    await database.db().update(drafts).set(values).where(eq(drafts.id, existing[0].id));
    return existing[0].id;
  }

  let result = await database
    .db()
    .insert(drafts)
    .values({...values, run_id: params.runId, company_id: params.companyId, founder_id: params.founderId, parent_id: params.parentId})
    .returning({id: drafts.id});

  return result[0].id;
}

// Addresses and companies already emailed (sent by the app or marked sent), so nobody gets a second email
async function getContacted() {
  let result = await database
    .db()
    .select({to_email: drafts.to_email, slug: companies.slug})
    .from(drafts)
    .innerJoin(companies, eq(companies.id, drafts.company_id))
    .where(and(eq(drafts.sent, true), eq(drafts.active, true)));

  return {emails: new Set(result.map((r) => r.to_email.toLowerCase()).filter(Boolean)), slugs: new Set(result.map((r) => r.slug))};
}

// Next draft to send: "send now" requests first, then oldest queued, skipping runs whose sending is paused
async function getNextQueued() {
  let result = await database
    .db()
    .select({draft: drafts, company_name: companies.name, company_slug: companies.slug, company_batch: companies.batch})
    .from(drafts)
    .innerJoin(companies, eq(companies.id, drafts.company_id))
    .innerJoin(runs, eq(runs.id, drafts.run_id))
    .where(and(eq(drafts.send_status, 'queued'), eq(drafts.active, true), eq(runs.send_paused, false)))
    .orderBy(desc(drafts.send_now), asc(drafts.queued_at), asc(drafts.id))
    .limit(1);

  return result.length ? _collate(utilsService.sanitizeSqlResult(result[0])) : null;
}

// Emails actually sent by the app since a moment, oldest first (for the rolling 24-hour limit)
async function getSentSince(params) {
  if (!params.since) {
    throw new Error('input_missing');
  }

  let result = await database
    .db()
    .select({sent_at: drafts.sent_at})
    .from(drafts)
    .where(and(isNotNull(drafts.message_id), gte(drafts.sent_at, params.since)))
    .orderBy(asc(drafts.sent_at));

  return utilsService.sanitizeSqlResult(result).map((r) => r.sent_at);
}

async function countQueued() {
  let result = await database
    .db()
    .select({id: drafts.id})
    .from(drafts)
    .where(and(inArray(drafts.send_status, ['queued', 'sending']), eq(drafts.active, true)));

  return result.length;
}

// Bulk send-status change, e.g. cancel a run's queue or recover drafts stuck in "sending"
async function updateSendStatuses(params) {
  if (!params.fromSendStatuses || !params.sendStatus) {
    throw new Error('input_missing');
  }

  let filters = [inArray(drafts.send_status, params.fromSendStatuses), eq(drafts.active, true)];
  params.runId ? filters.push(eq(drafts.run_id, params.runId)) : null;

  let _update = {send_status: params.sendStatus, send_now: false, updated_at: new Date()};
  params.hasOwnProperty('sendError') ? (_update.send_error = params.sendError) : null;
  params.hasOwnProperty('sendJobId') ? (_update.send_job_id = params.sendJobId) : null;
  params.sendStatus === 'unsent' ? (_update.queued_at = null) : null;

  let result = await database
    .db()
    .update(drafts)
    .set(_update)
    .where(and(...filters))
    .returning({id: drafts.id, run_id: drafts.run_id});

  return utilsService.sanitizeSqlResult(result);
}

// Bulk status change for one run's drafts, e.g. queue every unsent draft for a rewrite
async function updateDrafts(params) {
  if (!params.runId || !params.fromStatuses || !params.status) {
    throw new Error('input_missing');
  }

  let filters = [eq(drafts.run_id, params.runId), inArray(drafts.status, params.fromStatuses), eq(drafts.active, true), isNull(drafts.parent_id)];
  params.hasOwnProperty('sent') ? filters.push(eq(drafts.sent, params.sent)) : null;
  params.sendStatuses ? filters.push(inArray(drafts.send_status, params.sendStatuses)) : null;

  let result = await database
    .db()
    .update(drafts)
    .set({status: params.status, error: null, updated_at: new Date()})
    .where(and(...filters))
    .returning({id: drafts.id});

  return result.length;
}

function _collate(row) {
  return {...row.draft, company: {name: row.company_name, slug: row.company_slug, batch: row.company_batch}};
}

module.exports = {createDraft, createCopy, getDrafts, getDraft, getDraftedSlugs, getContacted, getNextQueued, getSentSince, countQueued, updateDraft, updateDrafts, updateSendStatuses};
