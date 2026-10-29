'use strict';

const dns = require('dns').promises;
const NodeCache = require('node-cache');

const utilsService = require('app/services/utils');

const config = require('app/configs/config');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|sentry|wixpress|example\.|@2x|u00|domain\.com|email\.com/i;
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const BATCH_RE = /^(Winter|Spring|Summer|Fall) \d{4}$|^[WSFX]\d{2}$|^IK12$/;
const SEASON = {Winter: 1, Spring: 2, Summer: 3, Fall: 4};
const CONTACT_PATHS = ['', '/contact', '/about', '/team', '/contact-us', '/about-us'];
const SITE_DEADLINE_MS = 10000;
const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'", '#x2F': '/', '#47': '/'};

const cache = new NodeCache();
let algoliaKeys = null;

async function getBatches() {
  let cacheKey = `batches-${utilsService.getObjectSignature({})}`;
  let cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  let res = await _algolia({hitsPerPage: 0, facets: JSON.stringify(['batch']), maxValuesPerFacet: 1000});
  let result = Object.entries(res.facets.batch)
    .filter(([batch]) => BATCH_RE.test(batch))
    .map(([batch, count]) => ({batch, count}))
    .sort((a, b) => _batchKey(b.batch) - _batchKey(a.batch));

  cache.set(cacheKey, result, config.CACHE.TIMEOUTS.META);
  return result;
}

async function getCompanies(batch) {
  if (!isBatch(batch)) {
    throw new Error('input_invalid');
  }

  let hits = [];
  let page = 0;
  let pages = 1;

  while (page < pages) {
    let res = await _algolia({hitsPerPage: 1000, page, facetFilters: JSON.stringify([[`batch:${batch}`]])});
    hits = hits.concat(res.hits);
    pages = res.nbPages;
    page++;
  }

  return hits
    .filter((h) => SLUG_RE.test(h.slug || ''))
    .map((h) => ({
      name: h.name,
      slug: h.slug,
      batch: h.batch || batch,
      website: h.website || '',
      oneLiner: h.one_liner || '',
      industry: h.subindustry || '',
      teamSize: h.team_size ?? null,
      launchedAt: h.launched_at || 0
    }))
    .sort((a, b) => b.launchedAt - a.launchedAt);
}

async function getCompany(slug) {
  if (!SLUG_RE.test(slug || '')) {
    throw new Error('input_invalid');
  }

  let page = await _get(`https://www.ycombinator.com/companies/${slug}`);
  let match = /data-page="([^"]*)"/.exec(page || '');

  if (!match) {
    throw new Error("Couldn't load this company's YC page");
  }

  let props = JSON.parse(_unescape(match[1])).props;
  let c = props.company || {};
  let website = c.website || '';
  let domain = domainOf(website);
  let [siteEmails, resolves] = await Promise.all([domain ? _withDeadline(_siteEmails(website, domain), SITE_DEADLINE_MS, []) : [], domain ? _resolves(domain) : false]);

  let founders = (c.founders || []).map((f) => {
    let name = f.full_name || '';
    let first = asciiName(name)[0] || '';

    return {
      name,
      title: f.title || '',
      linkedin: f.linkedin_url || '',
      twitter: f.twitter_url || '',
      emailsFound: siteEmails.filter((e) => first && e.split('@')[0].startsWith(first)),
      emailGuesses: resolves ? guesses(name, domain) : []
    };
  });

  return {
    website,
    domain,
    linkedin: c.linkedin_url || '',
    twitter: c.twitter_url || '',
    siteEmails,
    jobs: openJobs(props),
    founders
  };
}

function isBatch(batch) {
  return BATCH_RE.test(batch || '');
}

function domainOf(website) {
  try {
    let host = new URL(website.includes('//') ? website : `https://${website}`).hostname;
    return host.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function asciiName(s) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function guesses(fullName, domain) {
  let parts = asciiName(fullName);

  if (!parts.length || !domain) {
    return [];
  }

  let first = parts[0];
  let last = parts.length > 1 ? parts[parts.length - 1] : '';
  let out = [`${first}@${domain}`];

  if (last) {
    out.push(`${first}.${last}@${domain}`, `${first[0]}${last}@${domain}`, `${first}${last}@${domain}`);
  }

  return out;
}

function openJobs(props) {
  return (props.jobPostings || [])
    .filter((j) => j && typeof j === 'object' && !j.isIncomplete)
    .map((j) => {
      let path = j.url || '';
      return {title: j.title || 'Open role', url: path.startsWith('/') ? `https://www.ycombinator.com${path}` : path};
    });
}

async function _get(url, {timeout = 8000, body, headers} = {}) {
  try {
    let res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      body,
      headers: {'User-Agent': UA, ...(headers || {})},
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow'
    });

    if (!res.ok) {
      return null;
    }

    return (await res.text()).slice(0, 2000000);
  } catch {
    return null;
  }
}

async function _algolia(params) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!algoliaKeys) {
      let page = await _get('https://www.ycombinator.com/companies');
      let match = /window\.AlgoliaOpts = \{"app":"(\w+)","key":"([^"]+)"/.exec(page || '');

      if (!match) {
        throw new Error('yc_fail');
      }

      algoliaKeys = {app: match[1], key: match[2]};
    }

    let {app, key} = algoliaKeys;
    let body = JSON.stringify({params: new URLSearchParams(params).toString()});

    for (let host of [`${app}-dsn.algolia.net`, `${app}-1.algolianet.com`, `${app}-2.algolianet.com`]) {
      let res = await _get(`https://${host}/1/indexes/YCCompany_production/query`, {body, headers: {'X-Algolia-Application-Id': app, 'X-Algolia-API-Key': key}});

      if (res !== null) {
        return JSON.parse(res);
      }
    }

    algoliaKeys = null;
  }

  throw new Error('yc_fail');
}

function _batchKey(batch) {
  let [season, year] = batch.split(' ');
  return year ? parseInt(year) * 10 + (SEASON[season] || 0) : 0;
}

function _unescape(s) {
  return s.replace(/&(#?[a-zA-Z0-9]+);/g, (m, e) => {
    if (ENTITIES[e]) {
      return ENTITIES[e];
    }

    if (e[0] === '#') {
      let code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1));
      return Number.isNaN(code) ? m : String.fromCodePoint(code);
    }

    return m;
  });
}

async function _siteEmails(website, domain) {
  let found = new Set();
  let root = website.replace(/\/+$/, '');
  let pages = await Promise.all(CONTACT_PATHS.map((path) => _get(root + path, {timeout: 5000})));

  for (let body of pages) {
    let text = body || '';

    try {
      text = decodeURIComponent(text);
    } catch {
      // Pages with stray % characters stay as they are
    }

    for (let e of _unescape(text).match(EMAIL_RE) || []) {
      e = e.toLowerCase().replace(/^\.+|\.+$/g, '');
      let host = e.split('@')[1];

      if (!BAD_EMAIL.test(e) && (host === domain || host.endsWith(`.${domain}`))) {
        found.add(e);
      }
    }
  }

  return [...found].sort();
}

async function _resolves(domain) {
  try {
    await dns.lookup(domain);
    return true;
  } catch {
    return false;
  }
}

function _withDeadline(promise, ms, fallback) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms).unref())]);
}

// Emails published on a company's own site, within a time limit; used for non-YC companies too
function getSiteEmails(website, domain) {
  return domain ? _withDeadline(_siteEmails(website, domain), SITE_DEADLINE_MS, []) : Promise.resolve([]);
}

module.exports = {getBatches, getCompanies, getCompany, isBatch, domainOf, asciiName, guesses, openJobs, getSiteEmails, resolves: _resolves};
