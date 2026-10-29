'use strict';

const {and, desc, eq, inArray} = require('drizzle-orm');

const utilsService = require('app/services/utils');

const {companies, drafts} = require('app/models/schema');

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
    .onConflictDoUpdate({target: drafts.company_id, set: {status: 'pending', error: null, updated_at: new Date()}})
    .returning({id: drafts.id});

  return result[0].id;
}

async function getDrafts(params) {
  let filters = [eq(drafts.active, true)];
  params.runId ? filters.push(eq(drafts.run_id, params.runId)) : null;
  params.statuses ? filters.push(inArray(drafts.status, params.statuses)) : null;
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
  params.companyId ? filters.push(eq(drafts.company_id, params.companyId)) : null;

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

  if (params.hasOwnProperty('sent')) {
    _update.sent = params.sent;
    _update.sent_at = params.sent ? new Date() : null;
  }

  await database.db().update(drafts).set(_update).where(eq(drafts.id, params.draftId));
}

// Bulk status change for one run's drafts, e.g. queue every unsent draft for a rewrite
async function updateDrafts(params) {
  if (!params.runId || !params.fromStatuses || !params.status) {
    throw new Error('input_missing');
  }

  let filters = [eq(drafts.run_id, params.runId), inArray(drafts.status, params.fromStatuses), eq(drafts.active, true)];
  params.hasOwnProperty('sent') ? filters.push(eq(drafts.sent, params.sent)) : null;

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

module.exports = {createDraft, getDrafts, getDraft, getDraftedSlugs, updateDraft, updateDrafts};
