'use strict';

const wrapperService = require('app/services/wrapper');
const ycService = require('app/services/yc');

const status = require('app/configs/status');

async function getBatches() {
  let result = await ycService.getBatches();

  let response = status.getStatus('success');
  response.data.batches = result;
  return response;
}

module.exports = {
  getBatches: wrapperService.wrap(getBatches)
};
