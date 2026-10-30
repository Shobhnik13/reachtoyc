'use strict';

const mailerService = require('app/services/mailer');
const pipelineService = require('app/services/pipeline');
const profileService = require('app/services/profile');
const sendJobService = require('app/services/sendJob');
const senderService = require('app/services/sender');
const webService = require('app/services/web');
const wrapperService = require('app/services/wrapper');
const ycService = require('app/services/yc');

const companyModel = require('app/models/company');
const draftModel = require('app/models/draft');
const founderModel = require('app/models/founder');
const runModel = require('app/models/run');
const sendJobModel = require('app/models/sendJob');

const config = require('app/configs/config');
const status = require('app/configs/status');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createRun(params) {
  if (params.source === 'url') {
    return _createUrlRun(params);
  }

  if (!params.profileId || !params.batch || !params.companyLimit) {
    throw new Error('input_missing');
  }

  if (!ycService.isBatch(params.batch) || !(params.companyLimit >= 1 && params.companyLimit <= config.PIPELINE.MAX_COMPANY_LIMIT)) {
    throw new Error('input_invalid');
  }

  let profile = await profileService.getProfileKeys({profileId: params.profileId});

  if (!profile.active) {
    throw new Error('entity_missing');
  }

  if (!profile.ai_key || !profile.resume_markdown.trim()) {
    throw new Error('profile_incomplete');
  }

  // Emails are verified with Apify whenever APIFY_TOKEN is set; without it, site emails and guesses
  params.useApify = !!profile.apify_token;

  // Snapshot the prompt and resume so later profile edits don't change this run
  params.aiProvider = profile.ai_provider;
  params.aiModel = profile.ai_model;
  params.systemPrompt = profile.system_prompt;
  params.resumeMarkdown = profile.resume_markdown;

  let runId = await runModel.createRun(params);

  config.PIPELINE.AUTOSTART ? pipelineService.start(runId) : null;

  return _respond(runId);
}

async function getRuns(params) {
  let result = await runModel.getRuns(params);

  let response = status.getStatus('success');
  response.data.runs = result.map(_public);
  return response;
}

async function getRun(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  return _respond(params.runId);
}

// status 'canceled' stops an active run; 'queued' resumes a stopped one and retries what failed.
// 'queued' with addCompanies also drafts that many more new companies of the batch in the same run (50 + 20 = 70).
// 'queued' with regenerate rewrites every unsent draft of the run with the profile's current prompt.
async function updateRun(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  let run = await runModel.getRun({runId: params.runId});

  if (!run) {
    throw new Error('entity_missing');
  }

  let active = pipelineService.ACTIVE_STATUSES.includes(run.status);

  if (params.sendAll) {
    return _sendAll(run, params.includeGuesses, params.includeCofounders);
  }

  if (params.sending) {
    return _controlSending(run, params.sending);
  }

  if (params.status === 'canceled') {
    if (!active) {
      throw new Error('run_edit_fail');
    }

    await runModel.updateRun({runId: run.id, status: 'canceled', finishedAt: new Date(), fromStatuses: pipelineService.ACTIVE_STATUSES});
  } else if (params.status === 'queued') {
    if (active || pipelineService.isRunning(run.id)) {
      throw new Error('run_edit_fail');
    }

    if (params.hasOwnProperty('addCompanies') && !(params.addCompanies >= 1 && params.addCompanies <= config.PIPELINE.MAX_COMPANY_LIMIT)) {
      throw new Error('input_invalid');
    }

    let companyLimit = params.addCompanies ? run.stats.companies.scraped + params.addCompanies : null;

    if (params.regenerate) {
      await draftModel.updateDrafts({runId: run.id, fromStatuses: ['generated', 'failed'], sent: false, sendStatuses: ['unsent', 'failed'], status: 'pending'});
    }

    await companyModel.updateCompanies({runId: run.id, fromStatus: 'failed', status: 'pending'});
    await runModel.updateRun({runId: run.id, status: 'queued', error: null, finishedAt: null, companyLimit});
    config.PIPELINE.AUTOSTART ? pipelineService.start(run.id) : null;
  } else if (params.status) {
    throw new Error('input_invalid');
  }

  return _respond(run.id);
}

// One company that isn't from YC: the AI researches it, then the same emails/Apify/drafting stages run
async function _createUrlRun(params) {
  if (!params.profileId || !params.website) {
    throw new Error('input_missing');
  }

  if (params.email && !EMAIL_RE.test(params.email)) {
    throw new Error('input_invalid');
  }

  let site = await webService.checkPublicUrl(params.website);
  let profile = await profileService.getProfileKeys({profileId: params.profileId});

  if (!profile.active) {
    throw new Error('entity_missing');
  }

  if (!profile.ai_key || !profile.apify_token) {
    throw new Error('keys_missing');
  }

  if (!profile.resume_markdown.trim()) {
    throw new Error('profile_incomplete');
  }

  let runId = await runModel.createRun({
    profileId: params.profileId,
    source: 'url',
    batch: site.domain,
    companyLimit: 1,
    useApify: true,
    aiProvider: profile.ai_provider,
    aiModel: profile.ai_model,
    systemPrompt: profile.system_prompt,
    resumeMarkdown: profile.resume_markdown
  });

  await companyModel.createCompanies({runId, companies: [{slug: `url-${site.domain}`, name: site.domain, batch: site.domain, website: site.website, domain: site.domain}]});

  if (params.email) {
    let company = (await companyModel.getCompanies({runId}))[0];
    await founderModel.createFounders({companyId: company.id, founders: [{name: params.contactName || params.email.split('@')[0], title: 'Contact', manualEmail: params.email}]});
  }

  config.PIPELINE.AUTOSTART ? pipelineService.start(runId) : null;

  return _respond(runId);
}

// Creates a send job and returns at once; the job prepares the queue in the background (see services/sendJob.js)
async function _sendAll(run, includeGuesses, includeCofounders) {
  if (!mailerService.isConfigured()) {
    throw new Error('mail_missing');
  }

  if ((await senderService.remainingToday(run.daily_send_limit)) < 1) {
    throw new Error('daily_limit_reached');
  }

  if ((await sendJobModel.getSendJobs({runId: run.id, statuses: sendJobService.OPEN_STATUSES})).length) {
    throw new Error('send_job_running');
  }

  let sendJobId = await sendJobModel.createSendJob({runId: run.id, includeGuesses, includeCofounders});
  await runModel.updateRun({runId: run.id, sendPaused: false});
  sendJobService.start(sendJobId);

  return _respond(run.id);
}

async function _controlSending(run, action) {
  if (action === 'pause') {
    await runModel.updateRun({runId: run.id, sendPaused: true});
  } else if (action === 'resume') {
    await runModel.updateRun({runId: run.id, sendPaused: false});
    senderService.nudge();
  } else if (action === 'cancel') {
    await sendJobService.cancelForRun({runId: run.id});
    await draftModel.updateSendStatuses({runId: run.id, fromSendStatuses: ['queued'], sendStatus: 'unsent', sendError: null});
    await runModel.updateRun({runId: run.id, sendPaused: false});
  } else {
    throw new Error('input_invalid');
  }

  return _respond(run.id);
}

async function _respond(runId) {
  let result = await runModel.getRun({runId});

  if (!result) {
    throw new Error('entity_missing');
  }

  let response = status.getStatus('success');
  response.data.run = _public(result);
  response.data.run.send_job = (await sendJobModel.getSendJobs({runId, limit: 1}))[0] || null;
  return response;
}

function _public(run) {
  let {resume_markdown, ...rest} = run;
  return {...rest, resume_chars: resume_markdown.length};
}

module.exports = {
  createRun: wrapperService.wrap(createRun),
  getRuns: wrapperService.wrap(getRuns),
  getRun: wrapperService.wrap(getRun),
  updateRun: wrapperService.wrap(updateRun)
};
