'use strict';

const draftService = require('app/services/draft');
const senderService = require('app/services/sender');
const wrapperService = require('app/services/wrapper');

const companyModel = require('app/models/company');
const draftModel = require('app/models/draft');
const runModel = require('app/models/run');
const sendJobModel = require('app/models/sendJob');

const config = require('app/configs/config');

const OPEN_STATUSES = ['pending', 'preparing'];
const preparing = new Set();

// Prepares a job in the background; the HTTP request that created it has already returned
function start(sendJobId) {
  if (preparing.has(sendJobId) || !config.MAIL.AUTOSEND) {
    return;
  }

  preparing.add(sendJobId);
  prepare(sendJobId)
    .catch(async (e) => {
      console.error(`Send job ${sendJobId} failed:`, e);
      await sendJobModel.updateSendJob({sendJobId, status: 'failed', error: e.detail || e.message, finishedAt: new Date(), fromStatuses: OPEN_STATUSES});
    })
    .finally(() => preparing.delete(sendJobId));
}

// Picks the job's drafts, makes co-founder copies, and puts them in the send queue tagged with the job.
// Safe to run again after a restart: drafts already queued or sent are skipped. Returns the finished job.
async function prepare(sendJobId) {
  let job = await sendJobModel.getSendJob({sendJobId});

  if (!job || !OPEN_STATUSES.includes(job.status)) {
    return job;
  }

  await sendJobModel.updateSendJob({sendJobId, status: 'preparing', startedAt: job.started_at ? new Date(job.started_at) : new Date(), error: null});

  let run = await runModel.getRun({runId: job.run_id});
  let room = await senderService.remainingToday(run.daily_send_limit);
  let contacted = await draftModel.getContacted();
  let candidates = (await draftModel.getDrafts({runId: run.id, statuses: ['generated'], sent: false, sendStatuses: ['unsent', 'failed']})).reverse();
  let queuedAt = Date.now();
  let total = job.progress.queued + job.progress.sent;
  let overLimit = 0;

  for (let [i, draft] of candidates.entries()) {
    // Cancel or a deleted run stops the job between drafts
    if (i % 10 === 0 && i > 0 && !OPEN_STATUSES.includes((await sendJobModel.getSendJob({sendJobId})).status)) {
      return sendJobModel.getSendJob({sendJobId});
    }

    if ((draft.email_kind === 'guess' && !job.include_guesses) || (await senderService.whyNotSendable(draft, contacted))) {
      continue;
    }

    if (room < 1) {
      overLimit++;
      continue;
    }

    await draftModel.updateDraft({draftId: draft.id, sendStatus: 'queued', sendNow: false, sendJobId, queuedAt: new Date(queuedAt + i * 10), sendError: null});
    contacted.emails.add(draft.to_email.toLowerCase());
    room--;
    total++;

    if (job.include_cofounders) {
      let added = await _queueCofounders(draft, job, contacted, room, new Date(queuedAt + i * 10 + 1));
      room -= added.queued;
      total += added.queued;
      overLimit += added.overLimit;
    }

    await sendJobModel.updateSendJob({sendJobId, total});
    senderService.start();
  }

  await sendJobModel.updateSendJob({sendJobId, status: 'ready', total, overLimit, finishedAt: new Date(), fromStatuses: ['preparing']});
  total ? senderService.start() : null;

  return sendJobModel.getSendJob({sendJobId});
}

// Each other founder with a usable address gets the same email with their own name in the greeting; queued right after the main one
async function _queueCofounders(draft, job, contacted, room, queuedAt) {
  let company = await companyModel.getCompany({companyId: draft.company_id});
  let main = company.founders.find((f) => f.id === draft.founder_id);
  let result = {queued: 0, overLimit: 0};

  for (let f of company.founders) {
    let best = draftService.bestEmail(f);
    let address = best.email.toLowerCase();

    if (f.id === draft.founder_id || !address || contacted.emails.has(address) || (best.kind === 'guess' && !job.include_guesses)) {
      continue;
    }

    contacted.emails.add(address);

    if (result.queued >= room) {
      result.overLimit++;
      continue;
    }

    let copyId = await draftModel.createCopy({
      parentId: draft.id,
      runId: draft.run_id,
      companyId: draft.company_id,
      founderId: f.id,
      toEmail: best.email,
      emailKind: best.kind,
      subject: draft.subject,
      body: main ? draftService.swapGreeting(draft.body, main.name, f.name) : draft.body,
      model: draft.model
    });
    await draftModel.updateDraft({draftId: copyId, sendStatus: 'queued', sendNow: false, sendJobId: job.id, queuedAt, sendError: null});
    result.queued++;
  }

  return result;
}

async function cancelForRun(params) {
  let jobs = await sendJobModel.getSendJobs({runId: params.runId, statuses: OPEN_STATUSES});

  for (let job of jobs) {
    await sendJobModel.updateSendJob({sendJobId: job.id, status: 'canceled', finishedAt: new Date(), fromStatuses: OPEN_STATUSES});
  }
}

// On boot: unfinished jobs carry on preparing, with their runs paused so nothing sends until the user presses Resume
async function resumeOpenJobs() {
  let jobs = await sendJobModel.getSendJobs({statuses: OPEN_STATUSES});

  for (let job of jobs) {
    await runModel.updateRun({runId: job.run_id, sendPaused: true});
    start(job.id);
  }

  return jobs.length;
}

module.exports = {
  start,
  OPEN_STATUSES,
  prepare: wrapperService.wrap(prepare),
  cancelForRun: wrapperService.wrap(cancelForRun),
  resumeOpenJobs: wrapperService.wrap(resumeOpenJobs)
};
