'use strict';

const STATUSES = {
  success: {http: 200, message: 'Success'},
  generic_fail: {http: 500, message: 'Something went wrong. Please try again.'},
  url_missing: {http: 404, message: 'This endpoint does not exist.'},
  input_missing: {http: 400, message: 'Some required fields are missing.'},
  input_invalid: {http: 400, message: 'Some fields have invalid values.'},
  entity_missing: {http: 404, message: 'The requested record does not exist.'},
  profile_incomplete: {http: 400, message: 'Add the provider key (and APIFY_TOKEN if verifying emails) to the backend .env, and a resume to the profile, before starting a run.'},
  keys_missing: {http: 400, message: 'Set the AI key for this profile and APIFY_TOKEN in apps/backend/.env, then restart the backend.'},
  url_invalid: {http: 400, message: 'Enter a public company website, like https://acme.com.'},
  mail_missing: {http: 400, message: 'Set GMAIL_USER and GMAIL_APP_PASSWORD in apps/backend/.env, then restart the backend.'},
  mail_auth_fail: {http: 502, message: 'Gmail rejected the login. Check GMAIL_USER and GMAIL_APP_PASSWORD (an App Password, not your normal password).'},
  mail_fail: {http: 502, message: "Gmail couldn't send this email."},
  daily_limit_reached: {http: 409, message: "You've reached today's sending limit. Send the rest tomorrow, or raise the limit in your profile."},
  send_job_running: {http: 409, message: 'This run is already preparing a send. Wait for it, or cancel the queue first.'},
  draft_locked: {http: 409, message: 'This draft is queued to send. Unqueue it before editing.'},
  draft_not_sendable: {http: 409, message: "This draft can't be sent: it needs a generated email, a valid To address, and must not be sent already."},
  run_edit_fail: {http: 409, message: 'The run cannot move to that status from its current status.'},
  draft_edit_fail: {http: 409, message: 'The draft is being generated. Try again when it finishes.'},
  yc_fail: {http: 502, message: "Couldn't reach YC's company directory."},
  apify_fail: {http: 502, message: 'The Apify lookup failed.'},
  ai_fail: {http: 502, message: 'The AI provider returned an error.'},
  ai_refused: {http: 502, message: 'The AI provider declined to write this email.'},
  ai_parse_fail: {http: 502, message: "The AI response wasn't valid JSON with a subject and body."}
};

function getStatus(code) {
  let entry = STATUSES[code] ? code : 'generic_fail';

  return {
    code: entry,
    error: entry !== 'success',
    message: STATUSES[entry].message,
    data: {}
  };
}

function getHttpStatus(code) {
  return (STATUSES[code] || STATUSES.generic_fail).http;
}

module.exports = {getStatus, getHttpStatus};
