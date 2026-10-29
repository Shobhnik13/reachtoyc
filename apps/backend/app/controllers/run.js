'use strict';

const runService = require('app/services/run');
const wrapperService = require('app/services/wrapper');

// eslint-disable-next-line no-unused-vars
async function createRun(req, res, next) {
  if (req.body.source === 'url') {
    if (!req.body.profile_id || !req.body.website) {
      throw new Error('input_missing');
    }

    let urlParams = {profileId: parseInt(req.body.profile_id), source: 'url', website: String(req.body.website).trim().slice(0, 300)};
    req.body.email ? (urlParams.email = String(req.body.email).trim().toLowerCase().slice(0, 200)) : null;
    req.body.contact_name ? (urlParams.contactName = String(req.body.contact_name).trim().slice(0, 120)) : null;

    let urlResult = await runService.createRun(urlParams);
    return res.json(urlResult);
  }

  if (!req.body.profile_id || !req.body.batch || !req.body.company_limit) {
    throw new Error('input_missing');
  }

  let runParams = {
    profileId: parseInt(req.body.profile_id),
    batch: String(req.body.batch),
    companyLimit: parseInt(req.body.company_limit),
    hiringOnly: !!req.body.hiring_only,
    skipContacted: !!req.body.skip_contacted
  };

  let result = await runService.createRun(runParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function getRuns(req, res, next) {
  let runParams = {};
  req.query.profile_id ? (runParams.profileId = parseInt(req.query.profile_id)) : null;

  let result = await runService.getRuns(runParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function getRun(req, res, next) {
  let runParams = {runId: parseInt(req.params.run_id)};

  let result = await runService.getRun(runParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function updateRun(req, res, next) {
  if (!req.body.status) {
    throw new Error('input_missing');
  }

  let runParams = {runId: parseInt(req.params.run_id), status: String(req.body.status)};
  req.body.add_companies ? (runParams.addCompanies = parseInt(req.body.add_companies)) : null;
  req.body.regenerate ? (runParams.regenerate = true) : null;

  let result = await runService.updateRun(runParams);
  return res.json(result);
}

module.exports = {
  createRun: wrapperService.wrap(createRun),
  getRuns: wrapperService.wrap(getRuns),
  getRun: wrapperService.wrap(getRun),
  updateRun: wrapperService.wrap(updateRun)
};
