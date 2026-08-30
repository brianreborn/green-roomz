import { ValidationError } from './errors.mjs';
import {
  CONFIDENCE_MOODS,
  FAITH_LEVELS,
  FEAR_LEVELS,
  MONITOR_ALIAS,
  NEXUS_ALIAS,
  REBUKE_OP,
  YOLO_TOKEN,
} from './constants.mjs';
import { agentCanAdmit } from './memory.mjs';

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

export function audioDataFromBody(body) {
  for (const message of body?.messages ?? []) {
    if (!Array.isArray(message?.content)) continue;
    for (const part of message.content) {
      if (!part || typeof part !== 'object') continue;
      const data = part.input_audio?.data ?? part.audio_url ?? part.audio;
      if (typeof data === 'string' && data.toLowerCase().startsWith('data:audio/')) return data;
    }
  }
  return null;
}

export function isExplicitTranslationRequest(body) {
  const text = (body?.messages ?? []).flatMap((message) => typeof message?.content === 'string' ? [message.content] : []).join('\n');
  return /\btranslate\b|\btranslation\b/i.test(text);
}

const ROUTER_SENTINELS = new Set(['auto', NEXUS_ALIAS]);

export function isRouterSentinel(alias, registry) {
  if (!alias) return true;
  if (ROUTER_SENTINELS.has(alias)) return true;
  return Boolean(registry) && !registry.agents.has(alias);
}

export function isRoutableAlias(registry, alias) {
  if (!alias || !registry.agents.has(alias)) return false;
  if (ROUTER_SENTINELS.has(alias)) return false;
  return registry.status(alias).state !== 'unavailable';
}

export function aliasCanAdmit(registry, alias, processes) {
  if (!alias || !registry.agents.has(alias)) return false;
  if (ROUTER_SENTINELS.has(alias)) return false;
  const status = registry.status(alias);
  if (status.state === 'unavailable') return false;
  if ((status.missing ?? []).some((reason) => String(reason).startsWith('impractical'))) return false;
  const agent = registry.agents.get(alias);
  if (agent.runtime === 'logical') return true;
  if (status.state === 'ready') return true;
  let freeMemoryBytes;
  try {
    freeMemoryBytes = processes?.hostAdapter?.sampleResources?.()?.freeMemoryBytes;
  } catch {
    freeMemoryBytes = undefined;
  }
  return agentCanAdmit(agent, { freeMemoryBytes }).ok;
}

export function availableAliases(registry, visited = new Set()) {
  const names = [];
  for (const alias of registry.agents.keys()) {
    if (ROUTER_SENTINELS.has(alias)) continue;
    if (visited.has(alias)) continue;
    const status = registry.status(alias);
    if (status.state === 'unavailable') continue;
    if ((status.missing ?? []).some((reason) => String(reason).startsWith('impractical'))) continue;
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

/** Model ids that mean "route this for me" rather than pinning a specific agent. */
const AUTO_MODEL_IDS = new Set(['auto', 'green-roomz', 'green-roomz-auto', 'default', 'gpt-4', 'gpt-4o', 'gpt-3.5-turbo']);

const SLASH_ALIASES = Object.freeze({
  vision: 'vision-layout-agent',
  audio: 'audio-transcription-agent',
  code: 'qwenstral-code-speculator',
  cpp: 'qwenstral-code-speculator',
  text: 'general-text-speculator',
  chat: 'general-text-speculator',
  embed: 'semantic-embedding-agent',
  rerank: 'retrieval-rerank-agent',
  router: NEXUS_ALIAS,
  guard: 'safety-policy-agent',
  tts: 'speech-synthesis-agent',
  speak: 'speech-synthesis-agent',
  image: 'image-generation-agent',
  imagine: 'image-generation-agent',
  draw: 'image-generation-agent',
  auto: 'auto',
});

const FAITH_ALIASES = Object.freeze({ low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' });
const FEAR_ALIASES = Object.freeze({ low: 'low', medium: 'medium', high: 'high' });
const CONFIDENCE_ALIASES = Object.freeze({
  can: 'can', may: 'may', will: 'will', shall: 'shall', must: 'must',
  low: 'may', medium: 'will', high: 'shall', xhigh: 'must',
});

const COUNCIL_JUDGE_TOKENS = Object.freeze({
  'field-vote': 'field-vote', fieldvote: 'field-vote', field: 'field-vote', vote: 'field-vote',
  'judge-model': 'judge-model', judge: 'judge-model', model: 'judge-model',
  similarity: 'similarity', similar: 'similarity', embed: 'similarity',
});

/** Does a bare token look like it names a specific agent (vs. an ordinary word)? */
function looksLikeCouncilTarget(token) {
  if (Object.prototype.hasOwnProperty.call(SLASH_ALIASES, token) && SLASH_ALIASES[token] !== 'auto') return true;
  return /^[a-z][\w.-]*(@[\w.-]+)?(,[a-z][\w.-]*(@[\w.-]+)?)+$/.test(token)
    || /-(agent|speculator)(@[\w.-]+)?$/.test(token)
    || token.includes('@');
}

/**
 * `/council [targets] [judge] [serial|parallel] <prompt...>`
 *   targets  a base alias, a short name (code/vision/...), or a comma-list of aliases
 *   judge    field-vote | judge-model | similarity (and short forms)
 * Returns { targets, judge, parallel, rest } — `rest` is the remaining prompt.
 */
export function parseCouncilArgs(rawRest) {
  let rest = String(rawRest ?? '').trim();
  let targets = null;
  let judge = null;
  let parallel;
  for (let guard = 0; guard < 4 && rest; guard += 1) {
    const { head, rest: next } = takeToken(rest);
    if (!targets && !judge && parallel === undefined && looksLikeCouncilTarget(head)) {
      targets = head.includes(',')
        ? head.split(',').map((t) => SLASH_ALIASES[t] ?? t)
        : [SLASH_ALIASES[head] ?? head];
      rest = next;
      continue;
    }
    if (!judge && COUNCIL_JUDGE_TOKENS[head]) { judge = COUNCIL_JUDGE_TOKENS[head]; rest = next; continue; }
    if (parallel === undefined && (head === 'serial' || head === 'parallel')) { parallel = head === 'parallel'; rest = next; continue; }
    break;
  }
  return { targets, judge, parallel, rest };
}

function takeToken(rest) {
  const trimmed = String(rest ?? '').trim();
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return { head: '', rest: '' };
  return { head: match[1].toLowerCase(), rest: (match[2] ?? '').trim() };
}

export function parseFaithLevel(rest) {
  const { head, rest: next } = takeToken(rest);
  if (FAITH_LEVELS[head]) return { level: head, rest: next };
  const n = Number(head);
  if (Number.isFinite(n) && n >= 0 && n <= 1) {
    const level = n < 0.35 ? 'low' : n < 0.65 ? 'medium' : n < 0.9 ? 'high' : 'xhigh';
    return { level, rest: next };
  }
  throw new ValidationError('/faith needs low|medium|high|xhigh or 0-1');
}

export function parseFearLevel(rest) {
  const { head, rest: next } = takeToken(rest);
  if (FEAR_LEVELS[head]) return { level: head, rest: next };
  throw new ValidationError('/fear needs low|medium|high');
}

export function parseConfidenceMood(rest) {
  const { head, rest: next } = takeToken(rest);
  const mood = CONFIDENCE_ALIASES[head];
  if (mood && CONFIDENCE_MOODS[mood]) return { mood, rest: next };
  throw new ValidationError('/confidence needs can|may|will|shall|must (or low|medium|high|xhigh)');
}

export function parseYolo(rest) {
  const trimmed = String(rest ?? '').trim();
  if (!trimmed) return { yolo: true, rest: '' };
  const { head, rest: next } = takeToken(trimmed);
  if (head === 'on' || head === 'true' || head === '1') return { yolo: true, rest: next };
  if (head === 'off' || head === 'false' || head === '0') return { yolo: false, rest: next };
  return { yolo: true, rest: trimmed };
}

/** Chat-path aliases that must not be peeked as SSE /v1/chat/completions. */
export const NATIVE_CHAT = Object.freeze({
  'semantic-embedding-agent': { path: '/v1/embeddings', kind: 'embeddings' },
  'retrieval-rerank-agent': { path: '/v1/rerank', kind: 'rerank' },
  'audio-transcription-agent': { path: '/inference', kind: 'whisper' },
  'image-generation-agent': { path: '/v1/images/generations', kind: 'image' },
});

function latestUserCommandText(body) {
  const messages = body?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue;
    const content = messages[index].content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string' && part.trim()) return part;
        if (part && typeof part.text === 'string' && part.text.trim()) return part.text;
      }
    }
    return '';
  }
  return '';
}

export function parseSlashCommand(body) {
  const text = latestUserCommandText(body).trim();
  if (!text) return null;
  const unfenced = text.replace(/```[\s\S]*?```/g, '').trim();
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(unfenced);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const rawRest = (match[2] ?? '').trim();
  if (token === 'forget') {
    throw new ValidationError('/forget is not a proven phenomenon; use /rebuke to correct');
  }
  if (token === 'faith') {
    const parsed = parseFaithLevel(rawRest);
    return { token, alias: null, rest: parsed.rest, setting: 'faith', faith: parsed.level, settingOnly: !parsed.rest };
  }
  if (token === 'fear') {
    const parsed = parseFearLevel(rawRest);
    return { token, alias: null, rest: parsed.rest, setting: 'fear', fear: parsed.level, settingOnly: !parsed.rest };
  }
  if (token === 'confidence') {
    const parsed = parseConfidenceMood(rawRest);
    return { token, alias: null, rest: parsed.rest, setting: 'confidence', confidenceMood: parsed.mood, settingOnly: !parsed.rest };
  }
  if (token === YOLO_TOKEN) {
    const parsed = parseYolo(rawRest);
    return { token, alias: null, rest: parsed.rest, setting: YOLO_TOKEN, yolo: parsed.yolo, settingOnly: !parsed.rest };
  }
  if (token === REBUKE_OP) {
    return { token, alias: null, rest: rawRest, op: REBUKE_OP, settingOnly: false };
  }
  if (token === 'council') {
    const c = parseCouncilArgs(rawRest);
    return { token, alias: null, rest: c.rest, council: { targets: c.targets, judge: c.judge, parallel: c.parallel } };
  }
  if (!Object.prototype.hasOwnProperty.call(SLASH_ALIASES, token)) return null;
  return { token, alias: SLASH_ALIASES[token], rest: rawRest };
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
  const slash = parseSlashCommand(body);
  if (slash?.op === REBUKE_OP) {
    return finish(body, registry, null, REBUKE_OP, modality);
  }
  if (slash?.setting && slash.settingOnly) {
    return finish(body, registry, null, `slash_${slash.setting}`, modality);
  }
  if (slash?.token === 'auto') {
    return finish(body, registry, null, 'nexus', modality);
  }
  if (slash?.token === 'router') {
    return finish(body, registry, NEXUS_ALIAS, 'slash_router', modality);
  }
  if (slash?.token === 'vision' && !modality.image) {
    throw new ValidationError('/vision requires an attached image part');
  }
  if (slash?.token === 'audio' && !modality.audio) {
    throw new ValidationError('/audio requires an attached audio part');
  }
  if (slash?.token === 'tts' || slash?.token === 'speak') {
    return finish(body, registry, 'speech-synthesis-agent', 'slash_tts', modality);
  }
  if (modality.image && modality.audio) {
    if (slash?.token === 'vision') return finish(body, registry, 'vision-layout-agent', 'slash_vision', modality);
    if (slash?.token === 'audio') return finish(body, registry, 'audio-transcription-agent', 'slash_audio', modality);
    return finish(body, registry, null, 'nexus', modality);
  }
  // A modality picks the specialist; a `model: "<that alias>@<variant>"` picks
  // which variant of it. Otherwise the default variant (the base alias).
  const variantOf = (base) => {
    const m = body?.model;
    return (typeof m === 'string' && m.startsWith(`${base}@`) && registry.agents.has(m)) ? m : base;
  };
  if (modality.audio) return finish(body, registry, variantOf('audio-transcription-agent'), 'audio_input', modality);
  if (modality.image) return finish(body, registry, variantOf('vision-layout-agent'), 'image_input', modality);
  if (slash && slash.alias) {
    return finish(body, registry, slash.alias, `slash_${slash.token}`, modality);
  }
  if (body?.model === MONITOR_ALIAS && registry.agents.has(MONITOR_ALIAS)) {
    return finish(body, registry, MONITOR_ALIAS, 'mailbox', modality);
  }
  const requested = body?.model ?? null;
  // `model: "auto"` / "green-roomz" / "default" => let the nexus route (for OpenAI
  // clients that must send some model id but want routing, e.g. Continue).
  if (requested && !AUTO_MODEL_IDS.has(String(requested).toLowerCase())) {
    const reason = body.lock_alias === true ? 'lock_alias' : 'requested_alias';
    if (requested === NEXUS_ALIAS && body.lock_alias === true && registry.agents.has(requested) && registry.status(requested).state !== 'unavailable') {
      return finish(body, registry, requested, reason, modality);
    }
    if (requested !== NEXUS_ALIAS && isRoutableAlias(registry, requested)) {
      return finish(body, registry, requested, reason, modality);
    }
  }
  return finish(body, registry, null, 'nexus', modality);
}

/** Agency code-switch: choose a specialist register. Do not speak as that specialist. */
export function routeRequest(body, registry, _sessionAgent) {
  return hardRuleRoute(body, registry);
}
