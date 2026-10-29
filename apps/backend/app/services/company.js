'use strict';

const wrapperService = require('app/services/wrapper');

const companyModel = require('app/models/company');
const runModel = require('app/models/run');

const status = require('app/configs/status');

async function getCompanies(params) {
  if (!params.runId) {
    throw new Error('input_missing');
  }

  let run = await runModel.getRun({runId: params.runId});

  if (!run) {
    throw new Error('entity_missing');
  }

  let filters = {runId: params.runId, statuses: params.statuses, q: params.q};
  params.hasOwnProperty('sent') ? (filters.sent = params.sent) : null;

  let result = await companyModel.getCompanies({...filters, limit: params.limit, offset: params.offset, withChildren: true});
  let total = await companyModel.countCompanies(filters);

  let response = status.getStatus('success');
  response.data.companies = result;
  response.data.total = total;
  return response;
}

module.exports = {
  getCompanies: wrapperService.wrap(getCompanies)
};
