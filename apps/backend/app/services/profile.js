'use strict';

const wrapperService = require('app/services/wrapper');

const profileModel = require('app/models/profile');

const config = require('app/configs/config');
const status = require('app/configs/status');

async function createProfile(params) {
  if (!params.name || !params.aiProvider) {
    throw new Error('input_missing');
  }

  _validate(params);

  params.aiModel = params.aiModel || config.AI.DEFAULT_MODELS[params.aiProvider];
  params.systemPrompt = params.systemPrompt || config.AI.DEFAULT_SYSTEM_PROMPT;

  let profileId = await profileModel.createProfile(params);

  return _respond(profileId);
}

async function getProfiles(params) {
  let result = await profileModel.getProfiles({active: params.hasOwnProperty('active') ? params.active : true});

  let response = status.getStatus('success');
  response.data.profiles = result.map(_public);
  return response;
}

async function getProfile(params) {
  if (!params.profileId) {
    throw new Error('input_missing');
  }

  return _respond(params.profileId);
}

async function updateProfile(params) {
  if (!params.profileId) {
    throw new Error('input_missing');
  }

  _validate(params);

  let profile = await profileModel.getProfile({profileId: params.profileId});

  if (!profile) {
    throw new Error('entity_missing');
  }

  if (params.aiProvider && params.aiProvider !== profile.ai_provider && !params.aiModel) {
    params.aiModel = config.AI.DEFAULT_MODELS[params.aiProvider];
  }

  await profileModel.updateProfile(params);

  return _respond(params.profileId);
}

// Profile plus the keys it runs with, read from the backend .env; never sent to the client
async function getProfileKeys(params) {
  if (!params.profileId) {
    throw new Error('input_missing');
  }

  let profile = await profileModel.getProfile({profileId: params.profileId});

  if (!profile) {
    throw new Error('entity_missing');
  }

  return {...profile, ai_key: config.KEYS.AI[profile.ai_provider] || null, apify_token: config.KEYS.APIFY || null};
}

function _validate(params) {
  if (params.aiProvider && !config.AI.PROVIDERS.includes(params.aiProvider)) {
    throw new Error('input_invalid');
  }

  if (params.hasOwnProperty('apifyMaxUsd') && !(params.apifyMaxUsd >= 0.1 && params.apifyMaxUsd <= 100)) {
    throw new Error('input_invalid');
  }
}

async function _respond(profileId) {
  let result = await profileModel.getProfile({profileId});

  if (!result) {
    throw new Error('entity_missing');
  }

  let response = status.getStatus('success');
  response.data.profile = _public(result);
  return response;
}

function _public(profile) {
  return {
    ...profile,
    has_ai_key: !!config.KEYS.AI[profile.ai_provider],
    ai_key_env: `${profile.ai_provider.toUpperCase()}_API_KEY`,
    has_apify_token: !!config.KEYS.APIFY
  };
}

module.exports = {
  createProfile: wrapperService.wrap(createProfile),
  getProfiles: wrapperService.wrap(getProfiles),
  getProfile: wrapperService.wrap(getProfile),
  updateProfile: wrapperService.wrap(updateProfile),
  getProfileKeys: wrapperService.wrap(getProfileKeys)
};
