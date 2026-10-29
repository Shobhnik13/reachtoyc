'use strict';

const wrapperService = require('app/services/wrapper');

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
      APIFY_TOKEN: !!config.KEYS.APIFY
    }
  };
  return response;
}

module.exports = {
  getSettings: wrapperService.wrap(getSettings)
};
