'use strict';

const crypto = require('crypto');

function sanitizeSqlResult(result) {
  return JSON.parse(JSON.stringify(result));
}

function getObjectSignature(params) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(params, Object.keys(params || {}).sort()))
    .digest('hex');
}

async function mapLimit(items, limit, fn) {
  let results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      let i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return results;
}

function chunk(items, size) {
  let out = [];

  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }

  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {sanitizeSqlResult, getObjectSignature, mapLimit, chunk, sleep};
