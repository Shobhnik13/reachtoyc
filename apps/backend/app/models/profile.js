'use strict';

const {and, desc, eq} = require('drizzle-orm');

const utilsService = require('app/services/utils');

const {profiles} = require('app/models/schema');

const database = require('app/configs/database');

async function createProfile(params) {
  if (!params.name || !params.aiProvider || !params.aiModel || !params.systemPrompt) {
    throw new Error('input_missing');
  }

  let _insert = {
    name: params.name,
    ai_provider: params.aiProvider,
    ai_model: params.aiModel,
    resume_markdown: params.resumeMarkdown || '',
    system_prompt: params.systemPrompt,
    subject_template: params.subjectTemplate || ''
  };
  params.dailySendLimit ? (_insert.daily_send_limit = params.dailySendLimit) : null;
  params.hasOwnProperty('apifyMaxUsd') ? (_insert.apify_max_usd = params.apifyMaxUsd) : null;

  let result = await database.db().insert(profiles).values(_insert).returning({id: profiles.id});
  return result[0].id;
}

async function getProfiles(params) {
  let filters = [];
  params.hasOwnProperty('active') ? filters.push(eq(profiles.active, params.active)) : null;

  let result = await database
    .db()
    .select()
    .from(profiles)
    .where(and(...filters))
    .orderBy(desc(profiles.id));

  return utilsService.sanitizeSqlResult(result);
}

async function getProfile(params) {
  if (!params.profileId) {
    throw new Error('input_missing');
  }

  let filters = [eq(profiles.id, params.profileId)];
  params.hasOwnProperty('active') ? filters.push(eq(profiles.active, params.active)) : null;

  let result = await database
    .db()
    .select()
    .from(profiles)
    .where(and(...filters));

  return result.length ? utilsService.sanitizeSqlResult(result[0]) : null;
}

async function updateProfile(params) {
  if (!params.profileId) {
    throw new Error('input_missing');
  }

  let _update = {updated_at: new Date()};
  params.name ? (_update.name = params.name) : null;
  params.aiProvider ? (_update.ai_provider = params.aiProvider) : null;
  params.aiModel ? (_update.ai_model = params.aiModel) : null;
  params.hasOwnProperty('apifyMaxUsd') ? (_update.apify_max_usd = params.apifyMaxUsd) : null;
  params.hasOwnProperty('resumeMarkdown') ? (_update.resume_markdown = params.resumeMarkdown) : null;
  params.systemPrompt ? (_update.system_prompt = params.systemPrompt) : null;
  params.hasOwnProperty('subjectTemplate') ? (_update.subject_template = params.subjectTemplate) : null;
  params.dailySendLimit ? (_update.daily_send_limit = params.dailySendLimit) : null;

  if (params.hasOwnProperty('active')) {
    _update.active = params.active;
    _update.deleted_at = params.active ? null : new Date();
  }

  await database.db().update(profiles).set(_update).where(eq(profiles.id, params.profileId));
}

module.exports = {createProfile, getProfiles, getProfile, updateProfile};
