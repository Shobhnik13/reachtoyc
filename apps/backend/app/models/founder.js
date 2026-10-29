'use strict';

const {and, asc, eq, inArray} = require('drizzle-orm');

const utilsService = require('app/services/utils');

const {founders} = require('app/models/schema');

const database = require('app/configs/database');

async function createFounders(params) {
  if (!params.companyId || !params.founders) {
    throw new Error('input_missing');
  }

  if (!params.founders.length) {
    return;
  }

  let _insert = params.founders.map((f) => ({
    company_id: params.companyId,
    name: f.name,
    title: f.title || '',
    linkedin: f.linkedin || '',
    twitter: f.twitter || '',
    emails_found: f.emailsFound || [],
    email_guesses: f.emailGuesses || [],
    manual_email: f.manualEmail || null
  }));

  await database.db().insert(founders).values(_insert);
}

async function getFounders(params) {
  if (!params.companyIds) {
    throw new Error('input_missing');
  }

  if (!params.companyIds.length) {
    return [];
  }

  let filters = [inArray(founders.company_id, params.companyIds), eq(founders.active, true)];
  params.hasOwnProperty('apifyChecked') ? filters.push(eq(founders.apify_checked, params.apifyChecked)) : null;

  let result = await database
    .db()
    .select()
    .from(founders)
    .where(and(...filters))
    .orderBy(asc(founders.id));

  return utilsService.sanitizeSqlResult(result);
}

async function deactivateFounders(params) {
  if (!params.companyId) {
    throw new Error('input_missing');
  }

  await database.db().update(founders).set({active: false, deleted_at: new Date()}).where(eq(founders.company_id, params.companyId));
}

async function updateFounder(params) {
  if (!params.founderId) {
    throw new Error('input_missing');
  }

  let _update = {updated_at: new Date()};
  params.hasOwnProperty('apifyChecked') ? (_update.apify_checked = params.apifyChecked) : null;
  params.hasOwnProperty('apifyEmail') ? (_update.apify_email = params.apifyEmail) : null;
  params.hasOwnProperty('apifyStatus') ? (_update.apify_status = params.apifyStatus) : null;

  await database.db().update(founders).set(_update).where(eq(founders.id, params.founderId));
}

module.exports = {createFounders, getFounders, deactivateFounders, updateFounder};
