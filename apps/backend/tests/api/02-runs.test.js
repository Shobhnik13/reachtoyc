'use strict';

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');

const {call} = require('../setup/fetch');
const setup = require('../setup/setup');

const companyModel = require('app/models/company');
const draftModel = require('app/models/draft');
const founderModel = require('app/models/founder');
const runModel = require('app/models/run');

const data = {
  profile: {name: 'Me', ai_provider: 'anthropic', resume_markdown: '# Me'},
  run: {profile_id: 1, batch: 'Winter 2024', company_limit: 2, hiring_only: true}
};

test.describe('2. Runs, companies and drafts', () => {
  let base = '';
  let seq = 0;

  test.before(async () => {
    base = await setup.setup();
    await call(`${base}/profiles`, {method: 'POST', body: data.profile});
    await call(`${base}/profiles`, {method: 'POST', body: {...data.profile, name: 'No resume', resume_markdown: ''}});
  });

  test.after(() => setup.teardown());

  test.beforeEach(() => assert.equal(process.env.NODE_ENV, 'test'));

  test(`${++seq}. POST /runs without batch -> input_missing`, async () => {
    let res = await call(`${base}/runs`, {method: 'POST', body: {profile_id: 1, company_limit: 2}});
    assert.equal(res.code, 'input_missing');
  });

  test(`${++seq}. POST /runs with a bad batch or limit -> input_invalid`, async () => {
    assert.equal((await call(`${base}/runs`, {method: 'POST', body: {...data.run, batch: 'Autumn 2024'}})).code, 'input_invalid');
    assert.equal((await call(`${base}/runs`, {method: 'POST', body: {...data.run, company_limit: 9999}})).code, 'input_invalid');
  });

  test(`${++seq}. POST /runs for a missing profile -> entity_missing`, async () => {
    let res = await call(`${base}/runs`, {method: 'POST', body: {...data.run, profile_id: 42}});
    assert.equal(res.code, 'entity_missing');
  });

  test(`${++seq}. POST /runs for a profile without a resume or env key -> profile_incomplete`, async () => {
    assert.equal((await call(`${base}/runs`, {method: 'POST', body: {...data.run, profile_id: 2}})).code, 'profile_incomplete');
    await call(`${base}/profiles/2`, {method: 'PUT', body: {ai_provider: 'gemini', resume_markdown: '# Me'}});
    assert.equal((await call(`${base}/runs`, {method: 'POST', body: {...data.run, profile_id: 2}})).code, 'profile_incomplete');
  });

  test(`${++seq}. POST /runs snapshots the profile and queues`, async () => {
    let res = await call(`${base}/runs`, {method: 'POST', body: data.run});
    let r = res.data.run;
    assert.equal(res.code, 'success');
    assert.equal(r.id, 1);
    assert.equal(r.status, 'queued');
    assert.equal(r.batch, data.run.batch);
    assert.equal(r.company_limit, 2);
    assert.equal(r.hiring_only, true);
    assert.equal(r.skip_contacted, false);
    assert.equal(r.use_apify, true);
    assert.equal(r.ai_model, 'claude-opus-5-5');
    assert.equal(r.resume_chars, data.profile.resume_markdown.length);
    assert.equal(r.resume_markdown, undefined);
    assert.deepEqual(r.stats, {companies: {pending: 0, scraped: 0, skipped: 0, failed: 0}, drafts: {pending: 0, generated: 0, failed: 0, sent: 0}});
  });

  test(`${++seq}. PUT /runs/:id queued while active -> run_edit_fail`, async () => {
    let res = await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'queued'}});
    assert.equal(res.http, 409);
    assert.equal(res.code, 'run_edit_fail');
  });

  test(`${++seq}. PUT /runs/:id canceled stops it; canceling again fails`, async () => {
    let res = await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'canceled'}});
    assert.equal(res.data.run.status, 'canceled');
    assert.ok(res.data.run.finished_at);
    assert.equal((await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'canceled'}})).code, 'run_edit_fail');
  });

  test(`${++seq}. PUT /runs/:id queued resumes and resets failed companies`, async () => {
    await companyModel.createCompanies({runId: 1, companies: [{slug: 'acme', name: 'Acme', batch: 'Winter 2024', oneLiner: 'Anvils'}]});
    await companyModel.updateCompanies({runId: 1, fromStatus: 'pending', status: 'failed'});
    let res = await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'queued'}});
    assert.equal(res.data.run.status, 'queued');
    assert.equal(res.data.run.finished_at, null);
    assert.equal(res.data.run.stats.companies.pending, 1);
  });

  test(`${++seq}. resuming keeps started_at when it comes back from the DB as a string`, async () => {
    await runModel.updateRun({runId: 1, startedAt: new Date('2026-10-29T13:46:45.964Z')});
    let run = await runModel.getRun({runId: 1});
    assert.equal(typeof run.started_at, 'string');
    await runModel.updateRun({runId: 1, startedAt: run.started_at || new Date()});
    assert.equal((await runModel.getRun({runId: 1})).started_at, '2026-10-29T13:46:45.964Z');
  });

  test(`${++seq}. PUT /runs/:id queued with add_companies drafts that many more in the same run`, async () => {
    await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'canceled'}});
    let bad = await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'queued', add_companies: 9999}});
    assert.equal(bad.code, 'input_invalid');
    let res = await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'queued', add_companies: 20}});
    assert.equal(res.data.run.status, 'queued');
    assert.equal(res.data.run.company_limit, res.data.run.stats.companies.scraped + 20);
    assert.equal((await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'queued', add_companies: 20}})).code, 'run_edit_fail');
  });

  test(`${++seq}. GET /companies without run_id -> input_missing`, async () => {
    assert.equal((await call(`${base}/companies`)).code, 'input_missing');
  });

  test(`${++seq}. GET /companies nests founders and the draft`, async () => {
    await companyModel.updateCompany({companyId: 1, status: 'scraped', domain: 'acme.com', jobs: [{title: 'Engineer', url: 'https://www.ycombinator.com/companies/acme/jobs/1'}]});
    await founderModel.createFounders({companyId: 1, founders: [{name: 'Ada Lovelace', title: 'CEO', emailGuesses: ['ada@acme.com']}]});
    let draftId = await draftModel.createDraft({runId: 1, companyId: 1});
    await draftModel.updateDraft({draftId, status: 'generated', founderId: 1, toEmail: 'ada@acme.com', emailKind: 'guess', subject: 'hi', body: 'hello ada', sources: [{url: 'https://acme.com', title: 'Acme'}]});

    let res = await call(`${base}/companies?run_id=1`);
    let c = res.data.companies[0];
    assert.equal(res.code, 'success');
    assert.equal(c.slug, 'acme');
    assert.equal(c.job_count, 1);
    assert.equal(c.founders.length, 1);
    assert.deepEqual(c.founders[0].email_guesses, ['ada@acme.com']);
    assert.equal(c.draft.subject, 'hi');
    assert.deepEqual(c.draft.sources, [{url: 'https://acme.com', title: 'Acme'}]);
  });

  test(`${++seq}. GET /companies pages with limit/offset and filters by q and sent`, async () => {
    await companyModel.createCompanies({runId: 1, companies: [{slug: 'beta', name: 'Beta Labs', batch: 'Winter 2024'}, {slug: 'gamma', name: 'Gamma', batch: 'Winter 2024'}]});
    let page = await call(`${base}/companies?run_id=1&limit=2`);
    assert.equal(page.data.total, 3);
    assert.deepEqual(page.data.companies.map((c) => c.slug), ['acme', 'beta']);
    let next = await call(`${base}/companies?run_id=1&limit=2&offset=2`);
    assert.deepEqual(next.data.companies.map((c) => c.slug), ['gamma']);
    let byFounder = await call(`${base}/companies?run_id=1&q=lovelace`);
    assert.deepEqual(byFounder.data.companies.map((c) => c.slug), ['acme']);
    assert.equal((await call(`${base}/companies?run_id=1&q=100%25`)).data.total, 0);
    assert.equal((await call(`${base}/companies?run_id=1&statuses=scraped&sent=0`)).data.total, 1);
  });

  test(`${++seq}. PUT /drafts/:id edits text and marks sent`, async () => {
    let res = await call(`${base}/drafts/1`, {method: 'PUT', body: {subject: 'hey ada', body: 'new body', sent: 1}});
    let d = res.data.draft;
    assert.equal(d.subject, 'hey ada');
    assert.equal(d.body, 'new body');
    assert.equal(d.sent, true);
    assert.ok(d.sent_at);
    assert.equal(d.company.slug, 'acme');
  });

  test(`${++seq}. PUT /drafts/:id founder_id switches recipient and greeting without regenerating`, async () => {
    await founderModel.createFounders({companyId: 1, founders: [{name: 'Grace Hopper', title: 'CTO', emailGuesses: ['grace@acme.com']}]});
    await call(`${base}/drafts/1`, {method: 'PUT', body: {body: 'hey ada,\n\nada lovelace inspired this.'}});
    let res = await call(`${base}/drafts/1`, {method: 'PUT', body: {founder_id: 2}});
    let d = res.data.draft;
    assert.equal(res.code, 'success');
    assert.equal(d.status, 'generated');
    assert.equal(d.founder_id, 2);
    assert.equal(d.to_email, 'grace@acme.com');
    assert.equal(d.email_kind, 'guess');
    assert.equal(d.body, 'hey grace,\n\nada lovelace inspired this.');
  });

  test(`${++seq}. PUT /drafts/:id with an unknown founder -> input_invalid`, async () => {
    assert.equal((await call(`${base}/drafts/1`, {method: 'PUT', body: {founder_id: 99}})).code, 'input_invalid');
  });

  test(`${++seq}. GET /drafts filters by sent`, async () => {
    assert.equal((await call(`${base}/drafts?sent=1`)).data.drafts.length, 1);
    assert.equal((await call(`${base}/drafts?sent=0`)).data.drafts.length, 0);
  });

  test(`${++seq}. GET /runs counts sent drafts`, async () => {
    let res = await call(`${base}/runs`);
    assert.equal(res.data.runs[0].stats.drafts.sent, 1);
    assert.equal(res.data.runs[0].stats.drafts.generated, 1);
  });

  test(`${++seq}. drafted slugs (sent or not) of the same batch feed skip_contacted`, async () => {
    assert.deepEqual(await draftModel.getDraftedSlugs({batch: 'Winter 2024'}), ['acme']);
    await call(`${base}/drafts/1`, {method: 'PUT', body: {sent: 0}});
    assert.deepEqual(await draftModel.getDraftedSlugs({batch: 'Winter 2024'}), ['acme']);
    assert.deepEqual(await draftModel.getDraftedSlugs({batch: 'Summer 2024'}), []);
  });
  test(`${++seq}. PUT /runs/:id regenerate queues every unsent draft and leaves sent ones`, async () => {
    await call(`${base}/drafts/1`, {method: 'PUT', body: {sent: 1}});
    let companyId = (await call(`${base}/companies?run_id=1&q=beta`)).data.companies[0].id;
    await companyModel.updateCompany({companyId, status: 'scraped'});
    let otherDraft = await draftModel.createDraft({runId: 1, companyId});
    await draftModel.updateDraft({draftId: otherDraft, status: 'generated', subject: 's', body: 'b'});
    let run = (await call(`${base}/runs/1`)).data.run;
    if (['queued', 'scraping', 'enriching', 'drafting'].includes(run.status)) await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'canceled'}});

    let res = await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'queued', regenerate: true}});
    assert.equal(res.code, 'success');
    assert.equal(res.data.run.status, 'queued');
    assert.equal((await call(`${base}/drafts/${otherDraft}`)).data.draft.status, 'pending');
    assert.equal((await call(`${base}/drafts/1`)).data.draft.status, 'generated');
    await draftModel.updateDraft({draftId: otherDraft, status: 'generated'});
    await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'canceled'}});
  });
});
