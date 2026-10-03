import { ValidationError } from './errors.mjs';
import { NEXUS_ALIAS } from './constants.mjs';

function inspectContentPart(part, found) {
  if (!part || typeof part !== 'object') return;
  const type = String(part.type ?? '').toLowerCase();
  if (type === 'image_url' || type === 'input_image') found.image = true;
  if (type === 'input_audio' || type === 'audio') found.audio = true;
  const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
  if (typeof url === 'string' && url.toLowerCase().startsWith('data:image/')) found.image = true;
  const audio = part.input_audio?.data ?? part.audio_url;
  if (typeof audio === 'string' && audio.toLowerCase().startsWith('data:audio/')) found.audio = true;
}

export function detectModalities(body) {
  const found = { image: false, audio: false };
  for (const message of body?.messages ?? []) {
    if (!Array.isArray(message?.content)) continue;
    for (const part of message.content) inspectContentPart(part, found);
  }
  return found;
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content;
  if (!Array.isArray(message?.content)) return '';
  return message.content.map((part) => {
    if (typeof part === 'string') return part;
    if (typeof part?.text === 'string') return part.text;
    return '';
  }).filter(Boolean).join('\n');
}

export function latestUserMessageText(body) {
  const messages = body?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messageText(messages[index]);
  }
  return '';
}

export function isExplicitTranslationRequest(body) {
  const text = (body?.messages ?? []).flatMap((message) => typeof message?.content === 'string' ? [message.content] : []).join('\n');
  return /\btranslate\b|\btranslation\b/i.test(text);
}

const ROUTER_SENTINELS = new Set(['auto', NEXUS_ALIAS]);

export function isRouterSentinel(alias, _registry) {
  if (!alias) return true;
  if (ROUTER_SENTINELS.has(alias)) return true;
  // Unknown aliases are NOT sentinels — they must 400, not fall through to nexus.
  return false;
}

/** Compat / "route for me" model ids (not specialist pins). */
const AUTO_MODEL_IDS = new Set([
  'auto',
  'green-roomz',
  'green-roomz-auto',
  'default',
  'gpt-4',
  'gpt-4o',
  'gpt-3.5-turbo',
]);

export function isAutoModelId(alias) {
  if (alias == null || alias === '') return true;
  const id = String(alias);
  if (ROUTER_SENTINELS.has(id)) return true;
  return AUTO_MODEL_IDS.has(id.toLowerCase());
}

/**
 * Pure P0 pin policy for explicit client `model` values.
 * - auto / tool-router / compat ids → nexus (intentional /auto path)
 * - unknown alias → ValidationError 400 (never silent tool-router)
 * - known but unavailable → pin so gateway can 503 agent_unavailable
 * - known available + lock_alias → pin
 * - known available without lock → nexus (llama.app sticky last-alias ignore)
 *
 * @returns {{ decision: 'nexus' } | { decision: 'pin', alias: string, reason: string }}
 */
export function resolveExplicitModelPin(model, registry, { lockAlias = false } = {}) {
  if (isAutoModelId(model)) return { decision: 'nexus' };
  const alias = String(model);
  if (!registry?.agents?.has(alias)) {
    const allowed = [];
    if (registry?.agents?.keys) {
      for (const name of registry.agents.keys()) {
        if (!ROUTER_SENTINELS.has(name)) allowed.push(name);
      }
      allowed.sort();
    }
    throw new ValidationError(`Unknown agent alias: ${alias}`, { allowed });
  }
  const status = registry.status(alias);
  const unavailable = status?.state === 'unavailable';
  if (unavailable) {
    return {
      decision: 'pin',
      alias,
      reason: lockAlias ? 'lock_alias' : 'requested_alias',
    };
  }
  if (lockAlias) {
    return { decision: 'pin', alias, reason: 'lock_alias' };
  }
  return { decision: 'nexus' };
}

export function isRoutableAlias(registry, alias) {
  if (!alias || !registry.agents.has(alias)) return false;
  if (ROUTER_SENTINELS.has(alias)) return false;
  return registry.status(alias).state !== 'unavailable';
}

export function availableAliases(registry, visited = new Set()) {
  const names = [];
  for (const alias of registry.agents.keys()) {
    if (ROUTER_SENTINELS.has(alias)) continue;
    if (visited.has(alias)) continue;
    if (registry.status(alias).state === 'unavailable') continue;
    names.push(alias);
  }
  return names;
}

function finish(body, registry, alias, reason, modality) {
  return {
    requestedAlias: body.model ?? null,
    effectiveAlias: alias,
    agent: alias && registry.agents.has(alias) ? registry.get(alias) : null,
    modality,
    reason,
  };
}

const SLASH_ALIASES = Object.freeze({
  vision: 'vision-layout-agent',
  audio: 'audio-transcription-agent',
  code: 'qwenstral-code-speculator',
  cpp: 'qwenstral-code-speculator',
  text: 'general-text-speculator',
  chat: 'general-text-speculator',
  embed: 'semantic-embedding-agent',
  rerank: 'retrieval-rerank-agent',
  router: 'tool-router-agent',
  guard: 'safety-policy-agent',
  tts: 'speech-synthesis-agent',
  speak: 'speech-synthesis-agent',
  image: 'image-generation-agent',
  imagine: 'image-generation-agent',
  draw: 'image-generation-agent',
  auto: 'auto',
});

export function parseSlashCommand(body) {
  const text = latestUserMessageText(body).trim();
  if (!text) return null;
  const unfenced = text.replace(/```[\s\S]*?```/g, '').trim();
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(unfenced);
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SLASH_ALIASES, token)) return null;
  return { token, alias: SLASH_ALIASES[token], rest: (match[2] ?? '').trim() };
}

export function stripSlashCommand(body) {
  const parsed = parseSlashCommand(body);
  if (!parsed || !Array.isArray(body?.messages)) return body;
  const messages = body.messages.map((message) => ({ ...message }));
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue;
    const content = messages[index].content;
    if (typeof content === 'string') {
      messages[index] = { ...messages[index], content: parsed.rest };
    } else if (Array.isArray(content)) {
      let replaced = false;
      messages[index] = {
        ...messages[index],
        content: content.map((part) => {
          if (replaced) return part;
          if (typeof part === 'string') { replaced = true; return parsed.rest; }
          if (part && typeof part.text === 'string') {
            replaced = true;
            return { ...part, text: parsed.rest };
          }
          return part;
        }),
      };
    }
    break;
  }
  return { ...body, messages };
}

export function hardRuleRoute(body, registry) {
  const modality = detectModalities(body);
  if (modality.image && modality.audio) throw new ValidationError('Mixed image and audio input requires an explicitly qualified workflow');
  if (modality.audio) return finish(body, registry, 'audio-transcription-agent', 'audio_input', modality);
  if (modality.image) return finish(body, registry, 'vision-layout-agent', 'image_input', modality);
  const slash = parseSlashCommand(body);
  if (slash?.token === 'auto') {
    return finish(body, registry, null, 'nexus', modality);
  }
  if (slash && slash.alias) {
    return finish(body, registry, slash.alias, `slash_${slash.token}`, modality);
  }
  const pin = resolveExplicitModelPin(body?.model ?? null, registry, {
    lockAlias: body?.lock_alias === true,
  });
  if (pin.decision === 'pin') {
    return finish(body, registry, pin.alias, pin.reason, modality);
  }
  return finish(body, registry, null, 'nexus', modality);
}

export function routeRequest(body, registry, _sessionAgent) {
  return hardRuleRoute(body, registry);
}
