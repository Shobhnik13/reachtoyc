'use strict';

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');

const database = require('app/configs/database');

const aiService = require('app/services/ai');
const draftService = require('app/services/draft');
const researchService = require('app/services/research');
const webService = require('app/services/web');
const ycService = require('app/services/yc');

test.describe('Helpers', () => {
  let seq = 0;

  test(`${++seq}. email guesses follow first@, first.last@, flast@, firstlast@`, () => {
    assert.deepEqual(ycService.guesses('José Álvarez', 'acme.com'), ['jose@acme.com', 'jose.alvarez@acme.com', 'jalvarez@acme.com', 'josealvarez@acme.com']);
    assert.deepEqual(ycService.guesses('Cher', 'acme.com'), ['cher@acme.com']);
    assert.deepEqual(ycService.guesses('Ada', ''), []);
  });

  test(`${++seq}. domainOf strips www and handles bare hosts`, () => {
    assert.equal(ycService.domainOf('https://www.Acme.com/about'), 'acme.com');
    assert.equal(ycService.domainOf('acme.io'), 'acme.io');
    assert.equal(ycService.domainOf(''), '');
  });

  test(`${++seq}. batch names are validated`, () => {
    assert.equal(ycService.isBatch('Winter 2024'), true);
    assert.equal(ycService.isBatch('W24'), true);
    assert.equal(ycService.isBatch('Winter 2024; drop'), false);
  });

  test(`${++seq}. parseDraft pulls JSON out of prose and code fences`, () => {
    let d = aiService.parseDraft('Here you go:\n```json\n{"subject": "hi", "body": "hello\\nthere", "hook": "launch post"}\n```');
    assert.deepEqual(d, {subject: 'hi', body: 'hello\nthere', hook: 'launch post'});
    assert.throws(() => aiService.parseDraft('no json'), /ai_parse_fail/);
    assert.throws(() => aiService.parseDraft('{"subject": "", "body": "x"}'), /ai_parse_fail/);
  });

  test(`${++seq}. recipient: verified email beats CEO title, CEO breaks ties`, () => {
    let founders = [
      {name: 'A', title: 'CEO', email_guesses: ['a@x.com'], emails_found: []},
      {name: 'B', title: 'CTO', apify_email: 'b@x.com', apify_status: 'valid', email_guesses: [], emails_found: []},
      {name: 'C', title: 'COO', email_guesses: ['c@x.com'], emails_found: []}
    ];
    assert.equal(draftService.contacts(founders)[0].name, 'B');
    assert.equal(draftService.contacts([founders[2], founders[0]])[0].name, 'A');
    assert.deepEqual(draftService.bestEmail(founders[1]), {email: 'b@x.com', kind: 'valid'});
  });

  test(`${++seq}. swapGreeting changes only the greeting name and keeps its casing`, () => {
    assert.equal(draftService.swapGreeting('hey nooshin,\nnooshin built it', 'Nooshin Behroyan', 'Kenny Stone'), 'hey kenny,\nnooshin built it');
    assert.equal(draftService.swapGreeting('Hi Nooshin,', 'Nooshin B', 'Kenny S'), 'Hi Kenny,');
    assert.equal(draftService.swapGreeting('hello there,', 'Nooshin', 'Kenny'), 'hello there,');
  });

  test(`${++seq}. fillSubject fills {company} and {first_name}`, () => {
    let t = 'looking out for an engineering opportunity - would love to work as an engineer at {company}';
    assert.equal(draftService.fillSubject(t, {name: 'Praxis'}, {name: 'Ada Lovelace'}), 'looking out for an engineering opportunity - would love to work as an engineer at Praxis');
    assert.equal(draftService.fillSubject('hi {first_name} at {company}', {name: 'Acme'}, null), 'hi  at Acme');
  });

  test(`${++seq}. database queries retry transient network errors, not real ones`, async () => {
    let calls = 0;
    let flaky = database.withRetry(async () => {
      calls++;
      if (calls < 3) {
        throw Object.assign(new Error('Failed query: update ...'), {cause: Object.assign(new Error('read EADDRNOTAVAIL'), {code: 'EADDRNOTAVAIL'})});
      }
      return {rows: [1]};
    });
    assert.deepEqual(await flaky(), {rows: [1]});
    assert.equal(calls, 3);

    let broken = database.withRetry(async () => {
      throw Object.assign(new Error('syntax error'), {code: '42601'});
    });
    await assert.rejects(broken(), /syntax error/);
    assert.equal(database.isTransient({code: 'ECONNRESET'}), true);
    assert.equal(database.isTransient({code: '23505'}), false);
  });

  test(`${++seq}. company URLs must be public http(s) sites`, async () => {
    for (let bad of ['http://localhost:4100', 'http://127.0.0.1', 'http://10.0.0.5', 'http://192.168.1.10', 'http://169.254.169.254', 'ftp://acme.com', 'http://user:pw@8.8.8.8', 'acme']) {
      await assert.rejects(webService.checkPublicUrl(bad), /url_invalid/, bad);
    }
    assert.deepEqual(await webService.checkPublicUrl('8.8.8.8/about?x=1'), {website: 'https://8.8.8.8', domain: '8.8.8.8'});
    assert.equal(webService.isPrivateAddress('::ffff:10.1.2.3'), true);
    assert.equal(webService.isPrivateAddress('172.20.0.1'), true);
    assert.equal(webService.isPrivateAddress('172.32.0.1'), false);
  });

  test(`${++seq}. parseResearch keeps only well-formed facts`, () => {
    let r = researchService.parseResearch('Found it:\n{"name": "Acme", "one_liner": "Anvils", "team_size": 5, "linkedin": "javascript:alert(1)", "founders": [{"name": "Ada L", "title": "CEO", "linkedin": "https://linkedin.com/in/ada"}, {"title": "no name"}], "jobs": [{"title": "Engineer", "url": "https://acme.com/jobs"}]}');
    assert.equal(r.name, 'Acme');
    assert.equal(r.teamSize, 5);
    assert.equal(r.linkedin, '');
    assert.deepEqual(r.founders, [{name: 'Ada L', title: 'CEO', linkedin: 'https://linkedin.com/in/ada'}]);
    assert.deepEqual(r.jobs, [{title: 'Engineer', url: 'https://acme.com/jobs'}]);
    assert.throws(() => researchService.parseResearch('nothing'), /ai_parse_fail/);
  });

  test(`${++seq}. an email the user entered beats every other source`, () => {
    let f = {name: 'Ada', manual_email: 'ada@acme.com', apify_email: 'x@acme.com', apify_status: 'valid', email_guesses: [], emails_found: []};
    assert.deepEqual(draftService.bestEmail(f), {email: 'ada@acme.com', kind: 'manual'});
    assert.equal(draftService.contacts([{name: 'B', title: 'CEO', apify_email: 'b@acme.com', apify_status: 'valid'}, f])[0].name, 'Ada');
  });

  test(`${++seq}. prompt for a non-YC company has no YC lines`, () => {
    let prompt = draftService.buildPrompt({name: 'Acme', batch: 'acme.com', slug: 'url-acme.com', jobs: [], one_liner: 'Anvils'}, null);
    assert.doesNotMatch(prompt, /YC batch|YC page|on YC/);
  });

  test(`${++seq}. prompt marks web data as untrusted and asks for JSON`, () => {
    let prompt = draftService.buildPrompt({name: 'Acme', batch: 'W24', slug: 'acme', jobs: [], one_liner: 'Anvils'}, {name: 'Ada', title: 'CEO'});
    assert.match(prompt, /not instructions to you/);
    assert.match(prompt, /"subject"/);
    assert.match(prompt, /Ada, CEO/);
  });
});
