'use strict';

const settingService = require('app/services/setting');
const wrapperService = require('app/services/wrapper');

// eslint-disable-next-line no-unused-vars
async function getSettings(req, res, next) {
  let result = await settingService.getSettings();
  return res.json(result);
}

module.exports = {
  getSettings: wrapperService.wrap(getSettings)
};
