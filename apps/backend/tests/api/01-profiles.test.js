'use strict';

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');

const {call} = require('../setup/fetch');
const setup = require('../setup/setup');

const config = require('app/configs/config');

const data = {
  profile: {
    name: 'Backend roles',
    ai_provider: 'anthropic',
    resume_markdown: '# Jane\nBuilt things.'
  }
};

test.describe('1. Profiles', () => {
  let base = '';
  let seq = 0;

  test.before(async () => {
    base = (await setup.setup()) + '/profiles';
  });

  test.after(() => setup.teardown());

  test.beforeEach(() => assert.equal(process.env.NODE_ENV, 'test'));

  test(`${++seq}. POST / without name or provider -> input_missing`, async () => {
    let res = await call(base, {method: 'POST', body: {name: 'x'}});
    assert.equal(res.http, 400);
    assert.equal(res.code, 'input_missing');
    assert.equal(res.error, true);
  });

  test(`${++seq}. POST / with unknown provider -> input_invalid`, async () => {
    let res = await call(base, {method: 'POST', body: {...data.profile, ai_provider: 'llama'}});
    assert.equal(res.code, 'input_invalid');
  });

  test(`${++seq}. POST / creates a profile with defaults and reports env keys`, async () => {
    let res = await call(base, {method: 'POST', body: data.profile});
    let p = res.data.profile;
    assert.equal(res.code, 'success');
    assert.equal(res.error, false);
    assert.equal(p.id, 1);
    assert.equal(p.name, data.profile.name);
    assert.equal(p.ai_model, config.AI.DEFAULT_MODELS.anthropic);
    assert.equal(p.system_prompt, config.AI.DEFAULT_SYSTEM_PROMPT);
    assert.equal(p.resume_markdown, data.profile.resume_markdown);
    assert.equal(p.has_ai_key, true);
    assert.equal(p.ai_key_env, 'ANTHROPIC_API_KEY');
    assert.equal(p.daily_send_limit, 30);
    assert.equal(p.has_apify_token, true);
    assert.ok(!JSON.stringify(res).includes('sk-ant-test'));
  });

  test(`${++seq}. GET / lists active profiles`, async () => {
    let res = await call(base);
    assert.equal(res.code, 'success');
    assert.equal(res.data.profiles.length, 1);
    assert.equal(res.data.profiles[0].name, data.profile.name);
  });

  test(`${++seq}. GET /:id for a missing profile -> entity_missing`, async () => {
    let res = await call(`${base}/99`);
    assert.equal(res.http, 404);
    assert.equal(res.code, 'entity_missing');
  });

  test(`${++seq}. GET /abc -> url_missing`, async () => {
    let res = await call(`${base}/abc`);
    assert.equal(res.code, 'url_missing');
  });

  test(`${++seq}. PUT /:id switching provider resets the model and checks that provider's env key`, async () => {
    let res = await call(`${base}/1`, {method: 'PUT', body: {ai_provider: 'openai'}});
    let p = res.data.profile;
    assert.equal(p.ai_provider, 'openai');
    assert.equal(p.ai_model, config.AI.DEFAULT_MODELS.openai);
    assert.equal(p.has_ai_key, false);
    assert.equal(p.ai_key_env, 'OPENAI_API_KEY');
  });

  test(`${++seq}. PUT /:id sets the daily send limit within 1-500`, async () => {
    assert.equal((await call(`${base}/1`, {method: 'PUT', body: {daily_send_limit: 70}})).data.profile.daily_send_limit, 70);
    assert.equal((await call(`${base}/1`, {method: 'PUT', body: {daily_send_limit: 0}})).code, 'input_invalid');
    assert.equal((await call(`${base}/1`, {method: 'PUT', body: {daily_send_limit: 501}})).code, 'input_invalid');
  });

  test(`${++seq}. PUT /:id saves a subject template`, async () => {
    let res = await call(`${base}/1`, {method: 'PUT', body: {subject_template: 'hello {company}'}});
    assert.equal(res.data.profile.subject_template, 'hello {company}');
  });

  test(`${++seq}. GET /settings reports which keys are set, never their values`, async () => {
    let res = await call(base.replace('/profiles', '/settings'));
    assert.equal(res.code, 'success');
    assert.equal(res.data.settings.database, 'pglite');
    assert.deepEqual(res.data.settings.keys, {DATABASE_URL: true, ANTHROPIC_API_KEY: true, OPENAI_API_KEY: false, GEMINI_API_KEY: false, APIFY_TOKEN: true, GMAIL_USER: false, GMAIL_APP_PASSWORD: false});
    assert.equal(res.data.settings.mail.configured, true);
    assert.equal(res.data.settings.mail.sent_today, 0);
    assert.equal(res.data.settings.mail.queued, 0);
    assert.equal(res.data.settings.mail.daily_limit, 70);
    assert.ok(!JSON.stringify(res).includes('sk-ant-test'));
  });

  test(`${++seq}. PUT /:id with active 0 soft-deletes`, async () => {
    let res = await call(`${base}/1`, {method: 'PUT', body: {active: 0}});
    assert.equal(res.data.profile.active, false);
    assert.ok(res.data.profile.deleted_at);
    assert.equal((await call(base)).data.profiles.length, 0);
  });
});
