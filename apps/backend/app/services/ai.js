'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const {GoogleGenAI} = require('@google/genai');
const OpenAI = require('openai');

const wrapperService = require('app/services/wrapper');

const config = require('app/configs/config');

// Models that accept server-side refusal fallbacks and the dynamic-filtering web search tool
const FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
const MAX_CONTINUATIONS = 5;

// Returns {text, sources: [{url, title}]}; the model does its own web research unless research is false
async function generate(params) {
  if (!params.provider || !params.model || !params.apiKey || !params.system || !params.prompt) {
    throw new Error('input_missing');
  }

  let generators = {anthropic: _anthropic, openai: _openai, gemini: _gemini};

  if (!generators[params.provider]) {
    throw new Error('input_invalid');
  }

  try {
    return await generators[params.provider](params);
  } catch (e) {
    if (e.message === 'ai_refused') {
      throw e;
    }

    let err = new Error('ai_fail');
    err.detail = (e.status ? `${e.status} ` : '') + (e.message || 'Unknown error');
    throw err;
  }
}

// Pull the first JSON object out of a model reply; web-search models often wrap it in prose or a code fence.
// part 'subject' only needs a subject back; everything else needs subject and body.
function parseDraft(text, part = 'all') {
  let start = (text || '').indexOf('{');
  let end = (text || '').lastIndexOf('}');

  if (start === -1 || end <= start) {
    throw new Error('ai_parse_fail');
  }

  let parsed;

  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('ai_parse_fail');
  }

  let filled = (v) => typeof v === 'string' && v.trim();

  if (!filled(parsed.subject) || (part !== 'subject' && !filled(parsed.body))) {
    throw new Error('ai_parse_fail');
  }

  return {subject: parsed.subject.trim(), body: filled(parsed.body) ? parsed.body.trim() : '', hook: typeof parsed.hook === 'string' ? parsed.hook.trim() : ''};
}

async function _anthropic(params) {
  let client = new Anthropic({apiKey: params.apiKey});
  let modern = /opus|sonnet|fable/.test(params.model);
  let request = {
    model: params.model,
    max_tokens: 16000,
    system: [{type: 'text', text: params.system, cache_control: {type: 'ephemeral'}}],
    messages: [{role: 'user', content: params.prompt}]
  };

  if (params.research !== false) {
    request.tools = [{type: modern ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: config.AI.MAX_SEARCHES}];
  }

  if (!/haiku-4/.test(params.model)) {
    request.output_config = {effort: 'medium'};
  }

  let useFallbacks = FALLBACK_MODELS.includes(params.model);

  if (useFallbacks) {
    request.betas = ['server-side-fallback-2026-07-01'];
    request.fallbacks = 'default';
  }

  let send = () => (useFallbacks ? client.beta.messages.create(request) : client.messages.create(request));
  let response = await send();

  // Server-side search loops can pause; resend with the partial assistant turn and the API resumes
  for (let i = 0; response.stop_reason === 'pause_turn' && i < MAX_CONTINUATIONS; i++) {
    request.messages = [{role: 'user', content: params.prompt}, {role: 'assistant', content: response.content}];
    response = await send();
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('ai_refused');
  }

  let sources = [];

  for (let block of response.content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      block.content.forEach((r) => sources.push({url: r.url, title: r.title || ''}));
    }
  }

  let text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return {text, sources: _dedupe(sources)};
}

async function _openai(params) {
  let client = new OpenAI({apiKey: params.apiKey});
  let response = await client.responses.create({
    model: params.model,
    instructions: params.system,
    input: params.prompt,
    tools: params.research === false ? [] : [{type: 'web_search'}]
  });

  let sources = [];

  for (let item of response.output || []) {
    if (item.type !== 'message') {
      continue;
    }

    for (let part of item.content || []) {
      (part.annotations || []).filter((a) => a.type === 'url_citation').forEach((a) => sources.push({url: a.url, title: a.title || ''}));
    }
  }

  return {text: response.output_text || '', sources: _dedupe(sources)};
}

async function _gemini(params) {
  let client = new GoogleGenAI({apiKey: params.apiKey});
  let response = await client.models.generateContent({
    model: params.model,
    contents: params.prompt,
    config: {systemInstruction: params.system, tools: params.research === false ? [] : [{googleSearch: {}}]}
  });

  let chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  let sources = chunks.filter((c) => c.web && c.web.uri).map((c) => ({url: c.web.uri, title: c.web.title || ''}));

  return {text: response.text || '', sources: _dedupe(sources)};
}

function _dedupe(sources) {
  let seen = new Set();

  return sources.filter((s) => {
    if (!s.url || !/^https?:\/\//i.test(s.url) || seen.has(s.url)) {
      return false;
    }

    seen.add(s.url);
    return true;
  });
}

module.exports = {
  generate: wrapperService.wrap(generate),
  parseDraft
};
