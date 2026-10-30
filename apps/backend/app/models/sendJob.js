'use strict';

const {and, desc, eq, inArray, sql} = require('drizzle-orm');

const utilsService = require('app/services/utils');

const {drafts, sendJobs} = require('app/models/schema');

const database = require('app/configs/database');

async function createSendJob(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  let _insert = {run_id: params.runId, include_guesses: !!params.includeGuesses, include_cofounders: !!params.includeCofounders};

  let result = await database.db().insert(sendJobs).values(_insert).returning({id: sendJobs.id});
  return result[0].id;
}

async function getSendJobs(params) {
  let filters = [eq(sendJobs.active, true)];
  params.runId ? filters.push(eq(sendJobs.run_id, params.runId)) : null;
  params.statuses ? filters.push(inArray(sendJobs.status, params.statuses)) : null;

  let query = database
    .db()
    .select()
    .from(sendJobs)
    .where(and(...filters))
    .orderBy(desc(sendJobs.id));

  params.limit ? query.limit(params.limit) : null;

  return _collate(utilsService.sanitizeSqlResult(await query));
}

async function getSendJob(params) {
  if (!params.sendJobId) {
    throw new Error('input_missing');
  }

  let result = await database.db().select().from(sendJobs).where(eq(sendJobs.id, params.sendJobId));
  return result.length ? (await _collate(utilsService.sanitizeSqlResult(result)))[0] : null;
}

async function updateSendJob(params) {
  if (!params.sendJobId) {
    throw new Error('input_missing');
  }

  let _update = {updated_at: new Date()};
  params.status ? (_update.status = params.status) : null;
  params.hasOwnProperty('total') ? (_update.total = params.total) : null;
  params.hasOwnProperty('overLimit') ? (_update.over_limit = params.overLimit) : null;
  params.hasOwnProperty('error') ? (_update.error = params.error) : null;
  params.hasOwnProperty('startedAt') ? (_update.started_at = params.startedAt) : null;
  params.hasOwnProperty('finishedAt') ? (_update.finished_at = params.finishedAt) : null;

  let filters = [eq(sendJobs.id, params.sendJobId)];
  params.fromStatuses ? filters.push(inArray(sendJobs.status, params.fromStatuses)) : null;

  let result = await database
    .db()
    .update(sendJobs)
    .set(_update)
    .where(and(...filters))
    .returning({id: sendJobs.id});

  return result.length > 0;
}

// Each job's live progress comes from its drafts' send status
async function _collate(rows) {
  if (!rows.length) {
    return rows;
  }

  let counts = await database
    .db()
    .select({send_job_id: drafts.send_job_id, send_status: drafts.send_status, count: sql`count(*)::int`})
    .from(drafts)
    .where(inArray(drafts.send_job_id, rows.map((r) => r.id)))
    .groupBy(drafts.send_job_id, drafts.send_status);

  return rows.map((job) => {
    let progress = {queued: 0, sending: 0, sent: 0, failed: 0, unsent: 0};
    counts.filter((c) => c.send_job_id === job.id).forEach((c) => (progress[c.send_status] += c.count));
    return {...job, progress};
  });
}

module.exports = {createSendJob, getSendJobs, getSendJob, updateSendJob};
