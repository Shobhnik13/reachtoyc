'use strict';

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');

const {call} = require('../setup/fetch');
const setup = require('../setup/setup');

const mailerService = require('app/services/mailer');
const sendJobService = require('app/services/sendJob');
const senderService = require('app/services/sender');

const companyModel = require('app/models/company');
const draftModel = require('app/models/draft');
const founderModel = require('app/models/founder');

const draftModelFixture = [
  {slug: 'acme', name: 'Acme', email: 'ada@acme.com', kind: 'valid'},
  {slug: 'beta', name: 'Beta', email: 'bo@beta.com', kind: 'unknown'},
  {slug: 'gamma', name: 'Gamma', email: 'gus@gamma.com', kind: 'guess'},
  {slug: 'delta', name: 'Delta', email: '', kind: 'none'},
  {slug: 'echo', name: 'Echo', email: 'ada@acme.com', kind: 'site'}
];

// Sends whatever the worker would pick next, without the real-time gap
async function drain() {
  let results = [];

  for (let next = await draftModel.getNextQueued(); next; next = await draftModel.getNextQueued()) {
    results.push(await senderService.processDraft(next));
  }

  return results;
}

// Send all returns at once with a job; tests run the background preparation step directly
async function sendAll(base, body) {
  let res = await call(`${base}/runs/1`, {method: 'PUT', body: {send_all: true, ...body}});
  return res.code === 'success' ? {res, job: await sendJobService.prepare(res.data.run.send_job.id)} : {res, job: null};
}

test.describe('3. Sending', () => {
  let base = '';
  let seq = 0;
  let ids = {};

  test.before(async () => {
    base = await setup.setup();
    await call(`${base}/profiles`, {method: 'POST', body: {name: 'Me', ai_provider: 'anthropic', resume_markdown: '# Me'}});
    await call(`${base}/runs`, {method: 'POST', body: {profile_id: 1, batch: 'Winter 2024', company_limit: 5}});
    await call(`${base}/runs/1`, {method: 'PUT', body: {status: 'canceled'}});
    await companyModel.createCompanies({runId: 1, companies: draftModelFixture.map((c) => ({slug: c.slug, name: c.name, batch: 'Winter 2024'}))});
    let companies = await companyModel.getCompanies({runId: 1});

    for (let [i, c] of companies.entries()) {
      let fx = draftModelFixture[i];
      await companyModel.updateCompany({companyId: c.id, status: 'scraped'});
      await founderModel.createFounders({companyId: c.id, founders: [{name: 'Founder'}]});
      let draftId = await draftModel.createDraft({runId: 1, companyId: c.id});
      await draftModel.updateDraft({draftId, status: 'generated', subject: `hi ${fx.name}`, body: `hello ${fx.name}`, toEmail: fx.email, emailKind: fx.kind});
      ids[fx.slug] = draftId;
    }

    mailerService.takeFakeOutbox();
  });

  test.after(() => setup.teardown());

  test.beforeEach(() => assert.equal(process.env.NODE_ENV, 'test'));

  test(`${++seq}. GET /runs/:id shows what Send all would pick up, by email source`, async () => {
    let res = await call(`${base}/runs/1`);
    assert.deepEqual(res.data.run.stats.ready, {valid: 1, unknown: 1, guess: 1, site: 1});
    assert.equal(res.data.run.stats.send.unsent, 5);
  });

  test(`${++seq}. PUT /drafts/:id send_test mails the user, not the founder, and changes nothing`, async () => {
    let res = await call(`${base}/drafts/${ids.acme}`, {method: 'PUT', body: {send_test: true}});
    assert.equal(res.code, 'success');
    assert.equal(res.data.draft.send_status, 'unsent');
    let out = mailerService.takeFakeOutbox();
    assert.equal(out.length, 1);
    assert.equal(out[0].to, 'me@example.com');
    assert.equal(out[0].subject, '[test] hi Acme');
    assert.match(out[0].body, /ada@acme\.com/);
  });

  test(`${++seq}. PUT /runs/:id send_all returns a pending job at once`, async () => {
    let res = await call(`${base}/runs/1`, {method: 'PUT', body: {send_all: true}});
    assert.equal(res.code, 'success');
    assert.equal(res.data.run.send_job.status, 'pending');
    assert.equal(res.data.run.stats.send.queued, 0);
    assert.equal((await call(`${base}/runs/1`, {method: 'PUT', body: {send_all: true}})).code, 'send_job_running');
    await call(`${base}/runs/1`, {method: 'PUT', body: {sending: 'cancel'}});
    assert.equal((await call(`${base}/runs/1`)).data.run.send_job.status, 'canceled');
  });

  test(`${++seq}. the job queues sendable drafts in the background, skipping guesses and duplicate addresses`, async () => {
    let {res, job} = await sendAll(base, {});
    assert.equal(res.code, 'success');
    assert.equal(job.status, 'ready');
    assert.equal(job.total, 2);
    assert.equal(job.progress.queued, 2);
    assert.equal((await call(`${base}/drafts/${ids.echo}`)).data.draft.send_status, 'unsent');
    assert.equal((await call(`${base}/drafts/${ids.gamma}`)).data.draft.send_status, 'unsent');
    assert.equal((await call(`${base}/drafts/${ids.delta}`)).data.draft.send_status, 'unsent');
  });

  test(`${++seq}. queued drafts are locked for editing and regenerating`, async () => {
    let res = await call(`${base}/drafts/${ids.acme}`, {method: 'PUT', body: {subject: 'changed'}});
    assert.equal(res.http, 409);
    assert.equal(res.code, 'draft_locked');
    assert.equal((await call(`${base}/drafts/${ids.acme}`, {method: 'PUT', body: {status: 'pending'}})).code, 'draft_locked');
  });

  test(`${++seq}. paused queues don't send; resume lets them through`, async () => {
    await call(`${base}/runs/1`, {method: 'PUT', body: {sending: 'pause'}});
    assert.equal(await draftModel.getNextQueued(), null);
    let res = await call(`${base}/runs/1`, {method: 'PUT', body: {sending: 'resume'}});
    assert.equal(res.data.run.send_paused, false);
    assert.ok(await draftModel.getNextQueued());
  });

  test(`${++seq}. the worker sends in order, once per address, and records Gmail's message id`, async () => {
    let results = await drain();
    let out = mailerService.takeFakeOutbox();
    assert.deepEqual(results, ['sent', 'sent']);
    assert.deepEqual(out.map((m) => m.to), ['ada@acme.com', 'bo@beta.com']);

    let acme = (await call(`${base}/drafts/${ids.acme}`)).data.draft;
    assert.equal(acme.send_status, 'sent');
    assert.equal(acme.sent, true);
    assert.ok(acme.sent_at);
    assert.ok(acme.message_id);

    let echo = (await call(`${base}/drafts/${ids.echo}`)).data.draft;
    assert.equal(echo.send_status, 'unsent');
    assert.match(await senderService.whyNotSendable(echo), /already emailed/);
  });

  test(`${++seq}. send_all with include_guesses queues the guess too`, async () => {
    let {job} = await sendAll(base, {include_guesses: true});
    assert.equal(job.total, 1);
    assert.deepEqual(await drain(), ['sent']);
    assert.equal(mailerService.takeFakeOutbox()[0].to, 'gus@gamma.com');
  });

  test(`${++seq}. PUT /drafts/:id send refuses drafts without an address or already sent`, async () => {
    assert.equal((await call(`${base}/drafts/${ids.delta}`, {method: 'PUT', body: {send: true}})).code, 'draft_not_sendable');
    assert.equal((await call(`${base}/drafts/${ids.acme}`, {method: 'PUT', body: {send: true}})).code, 'draft_not_sendable');
  });

  test(`${++seq}. send now on one draft jumps the queue; send false and cancel take drafts back out`, async () => {
    await draftModel.updateDraft({draftId: ids.delta, toEmail: 'dan@delta.com', emailKind: 'manual'});
    let res = await call(`${base}/drafts/${ids.delta}`, {method: 'PUT', body: {send: true}});
    assert.equal(res.data.draft.send_status, 'queued');
    assert.equal(res.data.draft.send_now, true);

    assert.equal((await call(`${base}/drafts/${ids.delta}`, {method: 'PUT', body: {send: false}})).data.draft.send_status, 'unsent');

    await call(`${base}/drafts/${ids.delta}`, {method: 'PUT', body: {send: true}});
    let run = (await call(`${base}/runs/1`, {method: 'PUT', body: {sending: 'cancel'}})).data.run;
    assert.equal(run.stats.send.queued, 0);
    assert.equal((await call(`${base}/drafts/${ids.delta}`)).data.draft.send_status, 'unsent');
  });

  test(`${++seq}. a draft cut off mid-send is never resent blindly after a restart`, async () => {
    await draftModel.updateDraft({draftId: ids.delta, sendStatus: 'sending'});
    assert.equal(await senderService.interruptSending(), 1);
    let d = (await call(`${base}/drafts/${ids.delta}`)).data.draft;
    assert.equal(d.send_status, 'failed');
    assert.match(d.send_error, /Sent folder/);
  });

  test(`${++seq}. /settings reports how many went out today`, async () => {
    let res = await call(`${base}/settings`);
    assert.equal(res.data.settings.mail.sent_today, 3);
    assert.equal(res.data.settings.mail.daily_limit, 30);
    assert.equal((await call(`${base}/runs/1`)).data.run.daily_send_limit, 30);
  });

  test(`${++seq}. at the profile's daily limit, Send and Send all refuse`, async () => {
    await call(`${base}/profiles/1`, {method: 'PUT', body: {daily_send_limit: 3}});
    await draftModel.updateDraft({draftId: ids.delta, sendStatus: 'unsent', sendError: null});
    let one = await call(`${base}/drafts/${ids.delta}`, {method: 'PUT', body: {send: true}});
    assert.equal(one.http, 409);
    assert.equal(one.code, 'daily_limit_reached');
    assert.equal((await call(`${base}/runs/1`, {method: 'PUT', body: {send_all: true}})).code, 'daily_limit_reached');
  });

  test(`${++seq}. Send all queues only what fits today and reports the rest`, async () => {
    for (let slug of ['acme', 'beta', 'gamma']) await draftModel.updateDraft({draftId: ids[slug], toEmail: `new-${slug}@x.com`});
    await call(`${base}/profiles/1`, {method: 'PUT', body: {daily_send_limit: 4}});
    let fresh = await companyModel.createCompanies({runId: 1, companies: [{slug: 'foxtrot', name: 'Foxtrot', batch: 'Winter 2024'}, {slug: 'golf', name: 'Golf', batch: 'Winter 2024'}]});
    assert.equal(fresh, 2);
    let added = (await companyModel.getCompanies({runId: 1})).filter((c) => ['foxtrot', 'golf'].includes(c.slug));
    for (let c of added) {
      await companyModel.updateCompany({companyId: c.id, status: 'scraped'});
      let draftId = await draftModel.createDraft({runId: 1, companyId: c.id});
      await draftModel.updateDraft({draftId, status: 'generated', subject: 's', body: 'b', toEmail: `hi@${c.slug}.com`, emailKind: 'valid'});
    }
    let {res, job} = await sendAll(base, {});
    assert.equal(res.code, 'success');
    assert.equal(job.total, 1);
    assert.ok(job.over_limit >= 1);
  });

  test(`${++seq}. if the limit is hit mid-queue, the rest is taken back out with a reason`, async () => {
    await call(`${base}/profiles/1`, {method: 'PUT', body: {daily_send_limit: 3}});
    let next = await draftModel.getNextQueued();
    assert.equal(await senderService.processDraft(next), 'limit');
    let d = (await call(`${base}/drafts/${next.id}`)).data.draft;
    assert.equal(d.send_status, 'unsent');
    assert.match(d.send_error, /Daily limit of 3/);
    assert.equal(mailerService.takeFakeOutbox().length, 0);
  });

  test(`${++seq}. include_cofounders also emails the other founders, each with their own greeting`, async () => {
    await call(`${base}/profiles/1`, {method: 'PUT', body: {daily_send_limit: 100}});
    await call(`${base}/runs/1`, {method: 'PUT', body: {sending: 'cancel'}});
    await companyModel.createCompanies({runId: 1, companies: [{slug: 'hotel', name: 'Hotel', batch: 'Winter 2024'}]});
    let hotel = (await companyModel.getCompanies({runId: 1})).find((c) => c.slug === 'hotel');
    await companyModel.updateCompany({companyId: hotel.id, status: 'scraped'});
    await founderModel.createFounders({companyId: hotel.id, founders: [
      {name: 'Riwan Shah', title: 'CEO', emailsFound: ['riwan@hotel.com']},
      {name: 'Edward Liu', title: 'CTO', emailsFound: ['edward@hotel.com']},
      {name: 'Gina Guess', title: 'COO', emailGuesses: ['gina@hotel.com']}
    ]});
    let people = (await companyModel.getCompany({companyId: hotel.id})).founders;
    let draftId = await draftModel.createDraft({runId: 1, companyId: hotel.id});
    await draftModel.updateDraft({draftId, status: 'generated', founderId: people[0].id, subject: 'hello hotel', body: 'hey riwan,\n\nsame pitch.', toEmail: 'riwan@hotel.com', emailKind: 'site'});
    await draftModel.updateSendStatuses({fromSendStatuses: ['unsent', 'failed'], sendStatus: 'sent'});
    await draftModel.updateDraft({draftId, sendStatus: 'unsent'});
    mailerService.takeFakeOutbox();

    let {job} = await sendAll(base, {include_cofounders: true});
    assert.equal(job.total, 2);
    assert.equal(job.progress.queued, 2);
    assert.deepEqual(await drain(), ['sent', 'sent']);
    let out = mailerService.takeFakeOutbox();
    assert.deepEqual(out.map((m) => m.to), ['riwan@hotel.com', 'edward@hotel.com']);
    assert.equal(out[1].body, 'hey edward,\n\nsame pitch.');
    assert.equal(out[1].subject, 'hello hotel');

    let company = (await call(`${base}/companies?run_id=1&q=hotel`)).data.companies[0];
    assert.equal(company.draft.to_email, 'riwan@hotel.com');
    assert.equal(company.copies.length, 1);
    assert.equal(company.copies[0].sent, true);
    assert.equal((await call(`${base}/runs/1`)).data.run.stats.drafts.generated, 8);
    assert.equal((await call(`${base}/runs/1`)).data.run.send_job.progress.sent, 2);
  });
});
