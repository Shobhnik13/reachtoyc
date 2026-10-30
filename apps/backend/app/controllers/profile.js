'use strict';

const profileService = require('app/services/profile');
const wrapperService = require('app/services/wrapper');

// eslint-disable-next-line no-unused-vars
async function createProfile(req, res, next) {
  if (!req.body.name || !req.body.ai_provider) {
    throw new Error('input_missing');
  }

  let profileParams = _buildParams(req.body);

  let result = await profileService.createProfile(profileParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function getProfiles(req, res, next) {
  let profileParams = {};
  Object.hasOwn(req.query, 'active') ? (profileParams.active = req.query.active === '1' || req.query.active === 'true') : null;

  let result = await profileService.getProfiles(profileParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function getProfile(req, res, next) {
  let profileParams = {profileId: parseInt(req.params.profile_id)};

  let result = await profileService.getProfile(profileParams);
  return res.json(result);
}

// eslint-disable-next-line no-unused-vars
async function updateProfile(req, res, next) {
  let profileParams = _buildParams(req.body);
  profileParams.profileId = parseInt(req.params.profile_id);
  req.body.hasOwnProperty('active') ? (profileParams.active = !!req.body.active) : null;

  let result = await profileService.updateProfile(profileParams);
  return res.json(result);
}

function _buildParams(body) {
  let params = {};
  body.name ? (params.name = String(body.name).trim()) : null;
  body.ai_provider ? (params.aiProvider = String(body.ai_provider)) : null;
  body.ai_model ? (params.aiModel = String(body.ai_model).trim()) : null;
  body.hasOwnProperty('apify_max_usd') ? (params.apifyMaxUsd = parseFloat(body.apify_max_usd)) : null;
  body.hasOwnProperty('resume_markdown') ? (params.resumeMarkdown = String(body.resume_markdown || '')) : null;
  body.system_prompt ? (params.systemPrompt = String(body.system_prompt)) : null;
  body.hasOwnProperty('daily_send_limit') ? (params.dailySendLimit = parseInt(body.daily_send_limit)) : null;
  body.hasOwnProperty('subject_template') ? (params.subjectTemplate = String(body.subject_template || '').trim().slice(0, 300)) : null;
  return params;
}

module.exports = {
  createProfile: wrapperService.wrap(createProfile),
  getProfiles: wrapperService.wrap(getProfiles),
  getProfile: wrapperService.wrap(getProfile),
  updateProfile: wrapperService.wrap(updateProfile)
};
