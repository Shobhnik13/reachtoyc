'use strict';

const config = require('app/configs/config');

const schema = require('app/models/schema');

let state = null;

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

module.exports = {init, db, close};
