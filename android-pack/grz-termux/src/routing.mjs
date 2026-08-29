import { ValidationError } from './errors.mjs';
import { MONITOR_ALIAS, NEXUS_ALIAS } from './constants.mjs';
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

/** Chat-path aliases that must not be peeked as SSE /v1/chat/completions. */
export const NATIVE_CHAT = Object.freeze({
  'semantic-embedding-agent': { path: '/v1/embeddings', kind: 'embeddings' },
  'retrieval-rerank-agent': { path: '/v1/rerank', kind: 'rerank' },
  'audio-transcription-agent': { path: '/inference', kind: 'whisper' },
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
  const slash = parseSlashCommand(body);
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
    throw new ValidationError('/tts is not on /v1/chat/completions; speech-synthesis-agent has no persistent server');
  }
  if (modality.image && modality.audio) {
    if (slash?.token === 'vision') return finish(body, registry, 'vision-layout-agent', 'slash_vision', modality);
    if (slash?.token === 'audio') return finish(body, registry, 'audio-transcription-agent', 'slash_audio', modality);
    return finish(body, registry, null, 'nexus', modality);
  }
  if (modality.audio) return finish(body, registry, 'audio-transcription-agent', 'audio_input', modality);
  if (modality.image) return finish(body, registry, 'vision-layout-agent', 'image_input', modality);
  if (slash && slash.alias) {
    return finish(body, registry, slash.alias, `slash_${slash.token}`, modality);
  }
  if (body?.model === MONITOR_ALIAS && registry.agents.has(MONITOR_ALIAS)) {
    return finish(body, registry, MONITOR_ALIAS, 'mailbox', modality);
  }
  if (body?.lock_alias === true) {
    const requested = body.model ?? null;
    if (requested === NEXUS_ALIAS && registry.agents.has(requested) && registry.status(requested).state !== 'unavailable') {
      return finish(body, registry, requested, 'lock_alias', modality);
    }
    if (requested && isRoutableAlias(registry, requested)) {
      return finish(body, registry, requested, 'lock_alias', modality);
    }
  }
  return finish(body, registry, null, 'nexus', modality);
}

export function routeRequest(body, registry, _sessionAgent) {
  return hardRuleRoute(body, registry);
}
