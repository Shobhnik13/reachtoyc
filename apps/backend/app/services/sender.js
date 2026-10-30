'use strict';

const mailerService = require('app/services/mailer');
const wrapperService = require('app/services/wrapper');

const draftModel = require('app/models/draft');
const runModel = require('app/models/run');

const config = require('app/configs/config');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One in-process worker sends queued drafts one at a time, with a random gap; each profile caps how many go out per day
let state = {running: false, phase: 'idle', nextAt: null, lastSentAt: 0};
let wake = null;

function start() {
  if (state.running || !config.MAIL.AUTOSEND) {
    return;
  }

  state.running = true;
  _loop()
    .catch((e) => console.error('Send queue stopped:', e))
    .finally(() => {
      state.running = false;
      state.phase = 'idle';
      state.nextAt = null;
    });
}

// Cut a wait short, e.g. after "send now" or resume
function nudge() {
  wake ? wake() : start();
}

async function getStatus() {
  return {
    configured: mailerService.isConfigured(),
    phase: state.phase,
    next_at: state.nextAt ? new Date(state.nextAt).toISOString() : null,
    sent_today: await sentToday(),
    queued: await draftModel.countQueued(),
    from: config.MAIL.USER || null
  };
}

// Emails the app sent since local midnight; one Gmail account, so this counts across every profile and run
async function sentToday() {
  let midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return (await draftModel.getSentSince({since: midnight})).length;
}

// How many more can go out today under a profile's limit, counting what is already queued
async function remainingToday(limit) {
  return Math.max(0, limit - (await sentToday()) - (await draftModel.countQueued()));
}

async function _loop() {
  while (true) {
    let next = await draftModel.getNextQueued();

    if (!next) {
      return;
    }

    // Spacing between sends; a single "send now" doesn't wait
    let gap = config.MAIL.GAP_MIN_MS + Math.random() * Math.max(0, config.MAIL.GAP_MAX_MS - config.MAIL.GAP_MIN_MS);
    let readyAt = state.lastSentAt + gap;

    if (!next.send_now && Date.now() < readyAt) {
      state.phase = 'waiting';
      state.nextAt = readyAt;
      await _sleep(readyAt - Date.now());
      continue;
    }

    state.phase = 'sending';
    state.nextAt = null;
    let result = await processDraft(next);

    if (result === 'auth' || result === 'limit') {
      return;
    }
  }
}

// Sends one queued draft; also called directly by tests. Returns 'sent', 'skipped', 'failed' or 'auth'.
async function processDraft(draft) {
  let fresh = await draftModel.getDraft({draftId: draft.id});

  if (!fresh || fresh.send_status !== 'queued') {
    return 'skipped';
  }

  let reason = await whyNotSendable(fresh);

  if (reason) {
    await draftModel.updateDraft({draftId: fresh.id, sendStatus: 'failed', sendNow: false, sendError: reason});
    return 'failed';
  }

  // Hard stop at the profile's daily limit: never send over it, and take the rest of the queue back out
  let run = await runModel.getRun({runId: fresh.run_id});
  let limit = run ? run.daily_send_limit : 30;

  if ((await sentToday()) >= limit) {
    let message = `Daily limit of ${limit} emails reached. Send it again tomorrow, or raise the limit in your profile.`;
    await draftModel.updateSendStatuses({fromSendStatuses: ['queued'], sendStatus: 'unsent', sendError: message});
    return 'limit';
  }

  await draftModel.updateDraft({draftId: fresh.id, sendStatus: 'sending', sendError: null});

  try {
    let messageId = await mailerService.sendMail({to: fresh.to_email, subject: fresh.subject, body: fresh.body});
    await draftModel.updateDraft({draftId: fresh.id, sendStatus: 'sent', sendNow: false, sent: true, messageId, sendError: null});
    state.lastSentAt = Date.now();
    return 'sent';
  } catch (e) {
    // A bad login would fail every email: put this one back and pause everything until the user fixes .env
    if (e.message === 'mail_auth_fail') {
      await draftModel.updateDraft({draftId: fresh.id, sendStatus: 'queued', sendError: 'Gmail rejected the login. Fix GMAIL_USER / GMAIL_APP_PASSWORD, restart, then Resume.'});
      await pauseAll();
      return 'auth';
    }

    await draftModel.updateDraft({draftId: fresh.id, sendStatus: 'failed', sendNow: false, sendError: e.detail || e.message});
    return 'failed';
  }
}

// Null when the draft can go out, else a short reason. Pass `contacted` to reuse one lookup across many drafts.
async function whyNotSendable(draft, contacted) {
  if (draft.status !== 'generated' || !draft.subject.trim() || !draft.body.trim()) {
    return 'The email has not been written yet.';
  }

  if (draft.sent) {
    return 'Already sent.';
  }

  if (!EMAIL_RE.test(draft.to_email || '')) {
    return 'No valid To address.';
  }

  contacted = contacted || (await draftModel.getContacted());

  if (contacted.emails.has(draft.to_email.toLowerCase())) {
    return `${draft.to_email} was already emailed.`;
  }

  // A co-founder copy goes to the same company on purpose; only its own address must be new
  if (!draft.parent_id && draft.company && contacted.slugs.has(draft.company.slug)) {
    return `${draft.company.name} was already emailed.`;
  }

  return null;
}

async function pauseAll() {
  let runs = await runModel.getRuns({});

  for (let run of runs) {
    if (run.stats.send.queued > 0 && !run.send_paused) {
      await runModel.updateRun({runId: run.id, sendPaused: true});
    }
  }
}

// On boot: a send cut off mid-way may or may not have gone out, so it is never retried blindly, and queues stay paused
async function interruptSending() {
  let stuck = await draftModel.updateSendStatuses({
    fromSendStatuses: ['sending'],
    sendStatus: 'failed',
    sendError: "Interrupted while sending. Check your Gmail Sent folder; if it isn't there, press Send again."
  });

  await pauseAll();
  return stuck.length;
}

function _sleep(ms) {
  return new Promise((resolve) => {
    let timer = setTimeout(done, Math.max(0, ms));

    function done() {
      clearTimeout(timer);
      wake = null;
      resolve();
    }

    wake = done;
  });
}

module.exports = {
  start,
  nudge,
  getStatus: wrapperService.wrap(getStatus),
  sentToday: wrapperService.wrap(sentToday),
  remainingToday: wrapperService.wrap(remainingToday),
  processDraft: wrapperService.wrap(processDraft),
  whyNotSendable: wrapperService.wrap(whyNotSendable),
  pauseAll: wrapperService.wrap(pauseAll),
  interruptSending: wrapperService.wrap(interruptSending),
  EMAIL_RE
};
