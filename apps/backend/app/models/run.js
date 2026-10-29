'use strict';

const {and, desc, eq, inArray, sql} = require('drizzle-orm');

const utilsService = require('app/services/utils');

const {companies, drafts, profiles, runs} = require('app/models/schema');

const database = require('app/configs/database');

async function createRun(params) {
  if (!params.profileId || !params.batch || !params.companyLimit || !params.aiProvider || !params.aiModel || !params.systemPrompt) {
    throw new Error('input_missing');
  }

  let _insert = {
    profile_id: params.profileId,
    batch: params.batch,
    company_limit: params.companyLimit,
    hiring_only: !!params.hiringOnly,
    skip_contacted: !!params.skipContacted,
    use_apify: !!params.useApify,
    ai_provider: params.aiProvider,
    ai_model: params.aiModel,
    system_prompt: params.systemPrompt,
    resume_markdown: params.resumeMarkdown || ''
  };

  let result = await database.db().insert(runs).values(_insert).returning({id: runs.id});
  return result[0].id;
}

async function getRuns(params) {
  let filters = [eq(runs.active, true)];
  params.profileId ? filters.push(eq(runs.profile_id, params.profileId)) : null;
  params.statuses ? filters.push(inArray(runs.status, params.statuses)) : null;

  let result = await _select()
    .where(and(...filters))
    .orderBy(desc(runs.id));

  return _collate(utilsService.sanitizeSqlResult(result), await _getStats(result.map((r) => r.id)));
}

async function getRun(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  let result = await _select().where(and(eq(runs.id, params.runId), eq(runs.active, true)));

  if (!result.length) {
    return null;
  }

  return _collate(utilsService.sanitizeSqlResult(result), await _getStats([params.runId]))[0];
}

async function updateRun(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  let _update = {updated_at: new Date()};
  params.status ? (_update.status = params.status) : null;
  params.hasOwnProperty('error') ? (_update.error = params.error) : null;
  params.hasOwnProperty('startedAt') ? (_update.started_at = params.startedAt ? new Date(params.startedAt) : null) : null;
  params.hasOwnProperty('finishedAt') ? (_update.finished_at = params.finishedAt ? new Date(params.finishedAt) : null) : null;

  let filters = [eq(runs.id, params.runId)];
  params.fromStatuses ? filters.push(inArray(runs.status, params.fromStatuses)) : null;

  let result = await database
    .db()
    .update(runs)
    .set(_update)
    .where(and(...filters))
    .returning({id: runs.id});

  return result.length > 0;
}

function _select() {
  return database
    .db()
    .select({
      id: runs.id,
      profile_id: runs.profile_id,
      profile_name: profiles.name,
      batch: runs.batch,
      status: runs.status,
      company_limit: runs.company_limit,
      hiring_only: runs.hiring_only,
      skip_contacted: runs.skip_contacted,
      use_apify: runs.use_apify,
      ai_provider: runs.ai_provider,
      ai_model: runs.ai_model,
      system_prompt: runs.system_prompt,
      resume_markdown: runs.resume_markdown,
      error: runs.error,
      started_at: runs.started_at,
      finished_at: runs.finished_at,
      created_at: runs.created_at,
      updated_at: runs.updated_at
    })
    .from(runs)
    .innerJoin(profiles, eq(profiles.id, runs.profile_id));
}

async function _getStats(runIds) {
  if (!runIds.length) {
    return {companies: [], drafts: []};
  }

  let companyRows = await database
    .db()
    .select({run_id: companies.run_id, status: companies.status, count: sql`count(*)::int`})
    .from(companies)
    .where(inArray(companies.run_id, runIds))
    .groupBy(companies.run_id, companies.status);

  let draftRows = await database
    .db()
    .select({run_id: drafts.run_id, status: drafts.status, sent: drafts.sent, count: sql`count(*)::int`})
    .from(drafts)
    .where(inArray(drafts.run_id, runIds))
    .groupBy(drafts.run_id, drafts.status, drafts.sent);

  return {companies: companyRows, drafts: draftRows};
}

function _collate(rows, stats) {
  return rows.map((run) => {
    let c = {pending: 0, scraped: 0, skipped: 0, failed: 0};
    let d = {pending: 0, generated: 0, failed: 0, sent: 0};

    stats.companies.filter((s) => s.run_id === run.id).forEach((s) => (c[s.status] += s.count));
    stats.drafts
      .filter((s) => s.run_id === run.id)
      .forEach((s) => {
        d[s.status] += s.count;
        s.sent ? (d.sent += s.count) : null;
      });

    return {...run, stats: {companies: c, drafts: d}};
  });
}

module.exports = {createRun, getRuns, getRun, updateRun};
