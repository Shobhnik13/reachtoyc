'use strict';

const senderService = require('app/services/sender');
const wrapperService = require('app/services/wrapper');

const profileModel = require('app/models/profile');

const config = require('app/configs/config');
const status = require('app/configs/status');

// Which credentials the backend has, as booleans only; values never leave the server
async function getSettings() {
  let response = status.getStatus('success');
  response.data.settings = {
    database: config.DATABASE.URL.startsWith('pglite://') ? 'pglite' : 'postgres',
    keys: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      ANTHROPIC_API_KEY: !!config.KEYS.AI.anthropic,
      OPENAI_API_KEY: !!config.KEYS.AI.openai,
      GEMINI_API_KEY: !!config.KEYS.AI.gemini,
      APIFY_TOKEN: !!config.KEYS.APIFY,
      GMAIL_USER: !!config.MAIL.USER,
      GMAIL_APP_PASSWORD: !!config.MAIL.APP_PASSWORD
    },
    mail: {...(await senderService.getStatus()), daily_limit: await _dailyLimit()}
  };
  return response;
}

// One Gmail per install: the meter uses the newest profile's limit (one cheap query; the page polls this)
async function _dailyLimit() {
  let profiles = await profileModel.getProfiles({active: true});
  return profiles.length ? profiles[0].daily_send_limit : 30;
}

module.exports = {
  getSettings: wrapperService.wrap(getSettings)
};
