'use strict';

const pipelineService = require('app/services/pipeline');
const profileService = require('app/services/profile');
const wrapperService = require('app/services/wrapper');
const ycService = require('app/services/yc');

const companyModel = require('app/models/company');
const runModel = require('app/models/run');

const config = require('app/configs/config');
const status = require('app/configs/status');

async function createRun(params) {
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
async function updateRun(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  let run = await runModel.getRun({runId: params.runId});

  if (!run) {
    throw new Error('entity_missing');
  }

  let active = pipelineService.ACTIVE_STATUSES.includes(run.status);

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

    await companyModel.updateCompanies({runId: run.id, fromStatus: 'failed', status: 'pending'});
    await runModel.updateRun({runId: run.id, status: 'queued', error: null, finishedAt: null, companyLimit});
    config.PIPELINE.AUTOSTART ? pipelineService.start(run.id) : null;
  } else if (params.status) {
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
