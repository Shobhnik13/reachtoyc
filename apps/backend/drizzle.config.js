'use strict';

const {defineConfig} = require('drizzle-kit');

module.exports = defineConfig({
  dialect: 'postgresql',
  schema: './app/models/schema.js',
  out: './drizzle'
});
