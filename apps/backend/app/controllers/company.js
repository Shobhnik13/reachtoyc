'use strict';

const companyService = require('app/services/company');
const wrapperService = require('app/services/wrapper');

// eslint-disable-next-line no-unused-vars
async function getCompanies(req, res, next) {
  if (!req.query.run_id) {
    throw new Error('input_missing');
  }

  let companyParams = {runId: parseInt(req.query.run_id)};
  req.query.statuses ? (companyParams.statuses = String(req.query.statuses).split(',')) : null;
  req.query.q ? (companyParams.q = String(req.query.q).trim().slice(0, 100)) : null;
  Object.hasOwn(req.query, 'sent') ? (companyParams.sent = req.query.sent === '1' || req.query.sent === 'true') : null;
  req.query.limit ? (companyParams.limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 1000)) : null;
  req.query.offset ? (companyParams.offset = Math.max(parseInt(req.query.offset) || 0, 0)) : null;

  let result = await companyService.getCompanies(companyParams);
  return res.json(result);
}

module.exports = {
  getCompanies: wrapperService.wrap(getCompanies)
};
