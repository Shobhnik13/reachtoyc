'use strict';

const batchService = require('app/services/batch');
const wrapperService = require('app/services/wrapper');

// eslint-disable-next-line no-unused-vars
async function getBatches(req, res, next) {
  let result = await batchService.getBatches();
  return res.json(result);
}

module.exports = {
  getBatches: wrapperService.wrap(getBatches)
};
