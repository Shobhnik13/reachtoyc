'use strict';

const STATUSES = {
  success: {http: 200, message: 'Success'},
  generic_fail: {http: 500, message: 'Something went wrong. Please try again.'},
  url_missing: {http: 404, message: 'This endpoint does not exist.'},
  input_missing: {http: 400, message: 'Some required fields are missing.'},
  input_invalid: {http: 400, message: 'Some fields have invalid values.'},
  entity_missing: {http: 404, message: 'The requested record does not exist.'},
  profile_incomplete: {http: 400, message: 'Add the provider key (and APIFY_TOKEN if verifying emails) to the backend .env, and a resume to the profile, before starting a run.'},
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
