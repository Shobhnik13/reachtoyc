'use strict';

const config = require('app/configs/config');

const schema = require('app/models/schema');

let state = null;

// Network blips (laptop sleep, Wi-Fi changes, hosted Postgres dropping sockets) fail a query once; a retry gets a fresh connection
const TRANSIENT = new Set(['EADDRNOTAVAIL', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', '57P01', '08000', '08003', '08006']);
const RETRY_DELAYS_MS = [300, 1000, 3000];

function isTransient(e) {
  let err = e;

  for (let depth = 0; err && depth < 3; depth++) {
    if (TRANSIENT.has(err.code) || /Connection terminated|connection timeout/i.test(err.message || '')) {
      return true;
    }

    err = err.cause;
  }

  return false;
}

function withRetry(query) {
  return async function (...args) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await query(...args);
      } catch (e) {
        if (attempt >= RETRY_DELAYS_MS.length || !isTransient(e)) {
          throw e;
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  };
}

async function init() {
  if (state) {
    return state.db;
  }

  let url = config.DATABASE.URL;

  if (url.startsWith('pglite://')) {
    const {PGlite} = require('@electric-sql/pglite');
    const {drizzle} = require('drizzle-orm/pglite');
    const {migrate} = require('drizzle-orm/pglite/migrator');
    let location = url.slice('pglite://'.length);
    let client = location === 'memory' ? new PGlite() : new PGlite(location);
    let db = drizzle(client, {schema});
    await migrate(db, {migrationsFolder: config.DATABASE.MIGRATIONS});
    state = {db, close: () => client.close()};
  } else {
    const {Pool} = require('pg');
    const {drizzle} = require('drizzle-orm/node-postgres');
    const {migrate} = require('drizzle-orm/node-postgres/migrator');
    // Hosted Postgres (Neon etc.) drops idle connections; close them first, and never let a dropped one crash the process
    let pool = new Pool({connectionString: url, max: 10, idleTimeoutMillis: 30000, keepAlive: true, connectionTimeoutMillis: 15000});
    pool.on('error', (e) => console.error(`Database connection dropped (${e.code || e.message}); it will reconnect on the next query.`));
    pool.query = withRetry(pool.query.bind(pool));
    let db = drizzle(pool, {schema});
    await migrate(db, {migrationsFolder: config.DATABASE.MIGRATIONS});
    state = {db, close: () => pool.end()};
  }

  return state.db;
}

function db() {
  if (!state) {
    throw new Error('generic_fail');
  }

  return state.db;
}

async function close() {
  if (state) {
    await state.close();
    state = null;
  }
}

module.exports = {init, db, close, withRetry, isTransient};
