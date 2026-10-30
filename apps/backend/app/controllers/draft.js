'use strict';

const draftService = require('app/services/draft');
const wrapperService = require('app/services/wrapper');

// eslint-disable-next-line no-unused-vars
async function getDrafts(req, res, next) {
  let draftParams = {};
  req.query.run_id ? (draftParams.runId = parseInt(req.query.run_id)) : null;
  Object.hasOwn(req.query, 'sent') ? (draftParams.sent = req.query.sent === '1' || req.query.sent === 'true') : null;
  req.query.statuses ? (draftParams.statuses = String(req.query.statuses).split(',')) : null;

  let result = await draftService.getDrafts(draftParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function getDraft(req, res, next) {
  let draftParams = {draftId: parseInt(req.params.draft_id)};

  let result = await draftService.getDraft(draftParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function updateDraft(req, res, next) {
  let draftParams = {draftId: parseInt(req.params.draft_id)};
  req.body.hasOwnProperty('subject') ? (draftParams.subject = String(req.body.subject)) : null;
  req.body.hasOwnProperty('body') ? (draftParams.body = String(req.body.body)) : null;
  req.body.hasOwnProperty('to_email') ? (draftParams.toEmail = String(req.body.to_email).trim()) : null;
  req.body.hasOwnProperty('sent') ? (draftParams.sent = !!req.body.sent) : null;
  req.body.founder_id ? (draftParams.founderId = parseInt(req.body.founder_id)) : null;
  req.body.status ? (draftParams.status = String(req.body.status)) : null;
  req.body.part ? (draftParams.part = String(req.body.part)) : null;
  req.body.instructions ? (draftParams.instructions = String(req.body.instructions).trim().slice(0, 500)) : null;
  req.body.hasOwnProperty('send') ? (draftParams.send = !!req.body.send) : null;
  req.body.send_test ? (draftParams.sendTest = true) : null;

  let result = await draftService.updateDraft(draftParams);
  return res.json(result);
}

module.exports = {
  getDrafts: wrapperService.wrap(getDrafts),
  getDraft: wrapperService.wrap(getDraft),
  updateDraft: wrapperService.wrap(updateDraft)
};
