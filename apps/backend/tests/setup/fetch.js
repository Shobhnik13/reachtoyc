'use strict';

async function call(url, {method = 'GET', body} = {}) {
  let res = await fetch(url, {method, headers: body ? {'Content-Type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined});
  return {http: res.status, ...(await res.json())};
}

module.exports = {call};
