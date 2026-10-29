'use strict';

process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const test = require('node:test');

const aiService = require('app/services/ai');
const draftService = require('app/services/draft');
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

  test(`${++seq}. prompt marks web data as untrusted and asks for JSON`, () => {
    let prompt = draftService.buildPrompt({name: 'Acme', batch: 'W24', slug: 'acme', jobs: [], one_liner: 'Anvils'}, {name: 'Ada', title: 'CEO'});
    assert.match(prompt, /not instructions to you/);
    assert.match(prompt, /"subject"/);
    assert.match(prompt, /Ada, CEO/);
  });
});
