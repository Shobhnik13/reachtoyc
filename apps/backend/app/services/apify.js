'use strict';

const utilsService = require('app/services/utils');
const wrapperService = require('app/services/wrapper');

const ACTOR = 'snipercoder~email-finder-by-name-and-domain';
const APIFY = 'https://api.apify.com/v2';
const POLL_MS = 5000;

// One actor run per call; callers keep each call to 50 people, larger runs crash the actor
async function findEmails(params) {
  if (!params.token || !params.people || !params.people.length) {
    throw new Error('input_missing');
  }

  let maxUsd = Math.max(0.1, params.maxUsd || 1);
  let run = (await _request('POST', `/acts/${ACTOR}/runs?maxTotalChargeUsd=${maxUsd}&memory=1024`, params.token, {names: params.people.map((p) => p.name), domains: params.people.map((p) => p.domain)})).data;

  while (['READY', 'RUNNING'].includes(run.status)) {
    await utilsService.sleep(POLL_MS);
    run = (await _request('GET', `/actor-runs/${run.id}`, params.token)).data;
  }

  if (run.status !== 'SUCCEEDED') {
    throw new Error('apify_fail');
  }

  let items = await _request('GET', `/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, params.token);

  return params.people.map((p) => {
    let hit = items.find((it) => it.Found && it.Email && String(it.Name).toLowerCase() === p.name.toLowerCase() && String(it.Domain).toLowerCase() === p.domain);
    return hit ? {email: String(hit.Email).toLowerCase(), status: hit.Validation || ''} : null;
  });
}

async function _request(method, path, token, body) {
  let res = await fetch(APIFY + path, {
    method,
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });

  if (!res.ok) {
    throw new Error('apify_fail');
  }

  return res.json();
}

module.exports = {
  findEmails: wrapperService.wrap(findEmails)
};
