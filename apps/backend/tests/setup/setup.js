'use strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pglite://memory';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.APIFY_TOKEN = 'apify_api_test';

const {start} = require('../../server');

const database = require('app/configs/database');

let server = null;

async function setup() {
  server = await start(0);
  return `http://127.0.0.1:${server.address().port}`;
}

async function teardown() {
  await new Promise((resolve) => server.close(resolve));
  await database.close();
}

module.exports = {setup, teardown};
