'use strict';

const apifyService = require('app/services/apify');
const draftService = require('app/services/draft');
const profileService = require('app/services/profile');
const utilsService = require('app/services/utils');
const wrapperService = require('app/services/wrapper');
const ycService = require('app/services/yc');

const companyModel = require('app/models/company');
const draftModel = require('app/models/draft');
const founderModel = require('app/models/founder');
const runModel = require('app/models/run');

const config = require('app/configs/config');

const ACTIVE_STATUSES = ['queued', 'scraping', 'enriching', 'drafting'];
const running = new Set();

// Runs in-process and in the background; every stage only touches unfinished rows, so a run can resume after a restart
function start(runId) {
  if (running.has(runId)) {
    return false;
  }

  running.add(runId);

  _execute(runId)
    .catch(async (e) => {
      console.error(`Run ${runId} failed:`, e);
      await runModel.updateRun({runId, status: 'failed', error: e.detail || e.message, finishedAt: new Date(), fromStatuses: ACTIVE_STATUSES});
    })
    .finally(() => running.delete(runId));

  return true;
}

// On boot nothing restarts by itself: unfinished runs and regenerations are marked interrupted, and the user resumes them
async function interruptActiveRuns() {
  let runs = await runModel.getRuns({statuses: ACTIVE_STATUSES});

  for (let run of runs) {
    await runModel.updateRun({runId: run.id, status: 'canceled', error: 'Interrupted by a backend restart. Press Resume to continue.', finishedAt: new Date(), fromStatuses: ACTIVE_STATUSES});
  }

  let drafts = await draftModel.getDrafts({statuses: ['pending']});

  for (let draft of drafts) {
    await draftModel.updateDraft({draftId: draft.id, status: 'failed', error: 'Interrupted by a backend restart. Press Regenerate to try again.'});
  }

  return runs.length + drafts.length;
}

function isRunning(runId) {
  return running.has(runId);
}

async function _execute(runId) {
  let run = await runModel.getRun({runId});

  if (!run || !ACTIVE_STATUSES.includes(run.status)) {
    return;
  }

  await runModel.updateRun({runId, status: 'scraping', startedAt: run.started_at || new Date(), error: null, fromStatuses: ACTIVE_STATUSES});
  await _scrape(run);

  if (await _stopped(runId)) {
    return;
  }

  if (run.use_apify) {
    await runModel.updateRun({runId, status: 'enriching', fromStatuses: ACTIVE_STATUSES});

    // Apify is optional: on failure keep going with site emails and guesses, and say so on the run
    try {
      await _enrich(run);
    } catch (e) {
      await runModel.updateRun({runId, error: `Apify lookup stopped (${e.message}); drafts use site emails and guesses.`});
    }

    if (await _stopped(runId)) {
      return;
    }
  }

  await runModel.updateRun({runId, status: 'drafting', fromStatuses: ACTIVE_STATUSES});
  await _draft(run);

  if (await _stopped(runId)) {
    return;
  }

  await runModel.updateRun({runId, status: 'completed', finishedAt: new Date(), fromStatuses: ACTIVE_STATUSES});
}

async function _stopped(runId) {
  let run = await runModel.getRun({runId});
  return !run || !ACTIVE_STATUSES.includes(run.status);
}

// Load the batch once, then read YC pages in order until company_limit companies qualify
async function _scrape(run) {
  let total = await companyModel.countCompanies({runId: run.id});

  if (!total) {
    let list = await ycService.getCompanies(run.batch);

    if (run.skip_contacted) {
      let done = new Set(await draftModel.getDraftedSlugs({batch: run.batch}));
      list = list.filter((c) => !done.has(c.slug));
    }

    await companyModel.createCompanies({runId: run.id, companies: list});
  }

  while (true) {
    let qualified = await companyModel.countCompanies({runId: run.id, statuses: ['scraped']});
    let needed = run.company_limit - qualified;

    if (needed <= 0 || (await _stopped(run.id))) {
      return;
    }

    let next = await companyModel.getCompanies({runId: run.id, statuses: ['pending'], limit: Math.min(needed, 10)});

    if (!next.length) {
      return;
    }

    await utilsService.mapLimit(next, config.PIPELINE.SCRAPE_CONCURRENCY, (company) => _scrapeCompany(run, company));
  }
}

async function _scrapeCompany(run, company) {
  try {
    let details = await ycService.getCompany(company.slug);

    await founderModel.deactivateFounders({companyId: company.id});
    await founderModel.createFounders({companyId: company.id, founders: details.founders.filter((f) => f.name)});

    let skip = !details.founders.length ? 'No founders listed on YC' : run.hiring_only && !details.jobs.length ? 'No open roles on YC' : null;

    await companyModel.updateCompany({
      companyId: company.id,
      website: details.website,
      domain: details.domain,
      linkedin: details.linkedin,
      twitter: details.twitter,
      siteEmails: details.siteEmails,
      jobs: details.jobs,
      status: skip ? 'skipped' : 'scraped',
      error: skip
    });
  } catch (e) {
    await companyModel.updateCompany({companyId: company.id, status: 'failed', error: e.message});
  }
}

async function _enrich(run) {
  let profile = await profileService.getProfileKeys({profileId: run.profile_id});

  if (!profile.apify_token) {
    return;
  }

  let qualified = await companyModel.getCompanies({runId: run.id, statuses: ['scraped']});
  let domains = new Map(qualified.map((c) => [c.id, c.domain]));
  let people = (await founderModel.getFounders({companyIds: qualified.map((c) => c.id), apifyChecked: false})).filter((f) => domains.get(f.company_id));

  for (let group of utilsService.chunk(people, config.PIPELINE.APIFY_CHUNK)) {
    if (await _stopped(run.id)) {
      return;
    }

    let hits = await apifyService.findEmails({
      token: profile.apify_token,
      maxUsd: profile.apify_max_usd,
      people: group.map((f) => ({name: f.name, domain: domains.get(f.company_id)}))
    });

    for (let [i, f] of group.entries()) {
      await founderModel.updateFounder({founderId: f.id, apifyChecked: true, apifyEmail: hits[i] ? hits[i].email : null, apifyStatus: hits[i] ? hits[i].status : null});
    }
  }
}

async function _draft(run) {
  let todo = await companyModel.getCompanies({runId: run.id, statuses: ['scraped'], withoutGeneratedDraft: true});

  await utilsService.mapLimit(todo, config.PIPELINE.DRAFT_CONCURRENCY, async (company) => {
    if (!(await _stopped(run.id))) {
      await draftService.generateDraft({companyId: company.id});
    }
  });
}

module.exports = {
  start,
  interruptActiveRuns: wrapperService.wrap(interruptActiveRuns),
  isRunning,
  ACTIVE_STATUSES
};
