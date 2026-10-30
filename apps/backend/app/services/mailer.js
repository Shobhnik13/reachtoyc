'use strict';

const nodemailer = require('nodemailer');

const wrapperService = require('app/services/wrapper');

const config = require('app/configs/config');

let transport = null;
let fakeOutbox = [];

function isConfigured() {
  return config.MAIL.FAKE || !!(config.MAIL.USER && config.MAIL.APP_PASSWORD);
}

function fromAddress() {
  let user = config.MAIL.USER || 'me@example.com';
  return config.MAIL.FROM_NAME ? `"${config.MAIL.FROM_NAME.replace(/"/g, '')}" <${user}>` : user;
}

// Plain text only: no HTML, no tracking pixels, no rewritten links. Returns Gmail's Message-ID.
async function sendMail(params) {
  if (!params.to || !params.subject || !params.body) {
    throw new Error('input_missing');
  }

  if (!isConfigured()) {
    throw new Error('mail_missing');
  }

  try {
    let info = await _transport().sendMail({from: fromAddress(), to: params.to, subject: params.subject, text: params.body});

    if (config.MAIL.FAKE) {
      fakeOutbox.push({to: params.to, subject: params.subject, body: params.body, messageId: info.messageId});
    }

    return info.messageId;
  } catch (e) {
    let err = new Error(e.code === 'EAUTH' || e.responseCode === 535 ? 'mail_auth_fail' : 'mail_fail');
    err.detail = e.response || e.message;
    err.permanent = e.responseCode >= 500 && e.responseCode !== 535;
    throw err;
  }
}

function _transport() {
  if (!transport) {
    transport = config.MAIL.FAKE
      ? nodemailer.createTransport({jsonTransport: true})
      : nodemailer.createTransport({host: config.MAIL.HOST, port: config.MAIL.PORT, secure: true, auth: {user: config.MAIL.USER, pass: config.MAIL.APP_PASSWORD}});
  }

  return transport;
}

// Tests read what would have been sent
function takeFakeOutbox() {
  let out = fakeOutbox;
  fakeOutbox = [];
  return out;
}

module.exports = {
  isConfigured,
  sendMail: wrapperService.wrap(sendMail),
  takeFakeOutbox
};
