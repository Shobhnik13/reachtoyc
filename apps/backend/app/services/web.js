'use strict';

const dns = require('dns').promises;
const net = require('net');

const ycService = require('app/services/yc');

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

// A user-entered company website must be a public http(s) site: the backend fetches its pages, so no localhost or private network
async function checkPublicUrl(input) {
  let raw = String(input || '').trim();
  let url;

  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('url_invalid');
  }

  let host = url.hostname.toLowerCase();

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost') {
    throw new Error('url_invalid');
  }

  let addresses = net.isIP(host) ? [host] : (await dns.lookup(host, {all: true}).catch(() => [])).map((a) => a.address);

  if (!addresses.length || addresses.some(_isPrivate)) {
    throw new Error('url_invalid');
  }

  return {website: `${url.protocol}//${url.host}`, domain: ycService.domainOf(url.host)};
}

function _isPrivate(address) {
  if (net.isIPv6(address)) {
    let a = address.toLowerCase();
    return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80') || (a.startsWith('::ffff:') && _isPrivate(a.slice(7)));
  }

  return PRIVATE_V4.some((re) => re.test(address));
}

module.exports = {checkPublicUrl, isPrivateAddress: _isPrivate};
