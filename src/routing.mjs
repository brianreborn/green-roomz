import { stripControls } from './util.mjs';
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
import { admitWhenTightOf, agentCanAdmit } from './memory.mjs';

const MEDIA_TYPES = Object.freeze(['image', 'audio', 'video', 'model3d', 'spatial', 'document']);
const MEDIA_SLASH_INTENTS = Object.freeze({
  video: { kind: 'video' }, 'summarize-video': { kind: 'video', direction: 'input' }, 'describe-video': { kind: 'video', direction: 'input' },
  'generate-video': { kind: 'video', direction: 'output' }, 'make-video': { kind: 'video', direction: 'output' }, 'create-video': { kind: 'video', direction: 'output' },
  '3d': { kind: 'model3d' }, 'inspect-3d': { kind: 'model3d', direction: 'input' }, 'describe-3d': { kind: 'model3d', direction: 'input' },
  'generate-3d': { kind: 'model3d', direction: 'output' }, 'create-3d': { kind: 'model3d', direction: 'output' }, 'make-3d': { kind: 'model3d', direction: 'output' },
});
const OUTPUT_CAPABILITY = Object.freeze({ image: 'image-output', audio: 'audio-output', video: 'video-output', model3d: 'model3d-output', spatial: 'spatial-output' });

function markInput(found, kind) {
  if (MEDIA_TYPES.includes(kind)) {
    found.input[kind] = true;
    // Preserve the original public flags while callers migrate to input/output.
    if (kind === 'image' || kind === 'audio') found[kind] = true;
  }
}

function mediaKindFromMime(value) {
  const mime = String(value ?? '').split(';', 1)[0].trim().toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (/^(model\/(?:gltf|gltf-binary|obj|stl|vnd\.usdz)|application\/(?:vnd\.gltf\+json|vnd\.gltf\.binary|x-ply|ply|vnd\.ms-pki\.stl|vnd\.usdz\+zip))$/.test(mime)) return 'model3d';
  if (/^(application\/(?:pdf|rtf|msword|vnd\.|x-odt)|text\/(?:markdown|csv)|application\/epub\+zip)$/.test(mime)) return 'document';
  return null;
}

function mediaKindFromName(value) {
  const name = String(value ?? '').split(/[?#]/, 1)[0].toLowerCase();
  const ext = name.slice(name.lastIndexOf('.') + 1);
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'heic'].includes(ext)) return 'image';
  if (['wav', 'mp3', 'm4a', 'ogg', 'flac', 'aac', 'opus'].includes(ext)) return 'audio';
  if (['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'mpeg', 'mpg'].includes(ext)) return 'video';
  if (['glb', 'gltf', 'obj', 'stl', 'ply', 'usdz', 'fbx', 'dae', '3mf'].includes(ext)) return 'model3d';
  if (['pdf', 'doc', 'docx', 'odt', 'rtf', 'md', 'csv', 'ppt', 'pptx', 'xls', 'xlsx', 'epub'].includes(ext)) return 'document';
  return null;
}

function inspectContentPart(part, found) {
  if (!part || typeof part !== 'object') return;
  const type = String(part.type ?? '').toLowerCase();
  const typeKind = new Map([
    ['image_url', 'image'], ['input_image', 'image'], ['image', 'image'],
    ['input_audio', 'audio'], ['audio', 'audio'],
    ['video_url', 'video'], ['input_video', 'video'], ['video', 'video'], ['video_frame', 'video'],
    ['input_3d', 'model3d'], ['model_3d', 'model3d'], ['3d_model', 'model3d'], ['mesh', 'model3d'], ['point_cloud', 'spatial'],
    ['file', 'document'], ['input_file', 'document'],
  ]).get(type);
  if (typeKind) markInput(found, typeKind);
  const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
  const media = [url, part.input_audio?.data, part.audio_url, part.video_url?.url, part.video_url, part.input_video?.data,
    part.model_3d?.url, part.model_url, part.file_url, part.file?.url, part.file?.filename, part.filename, part.name];
  for (const value of media) {
    if (typeof value !== 'string') continue;
    const dataMime = /^data:([^;,]+)/i.exec(value)?.[1];
    const kind = mediaKindFromMime(dataMime) ?? mediaKindFromName(value);
    if (kind) markInput(found, kind);
  }
  const spatialFields = ['point_cloud', 'depth_map', 'pose', 'joints', 'keypoints', 'trajectory', 'transforms'];
  if (spatialFields.some((key) => part[key] != null)) markInput(found, 'spatial');
}

export function detectModalities(body) {
  const input = Object.fromEntries(MEDIA_TYPES.map((kind) => [kind, false]));
  const output = Object.fromEntries([...MEDIA_TYPES, 'text'].map((kind) => [kind, false]));
  const found = { image: false, audio: false, video: false, model3d: false, spatial: false, document: false, input, output };
  const declaredOutput = [body?.modalities, body?.output_modalities, body?.response_modalities].flatMap((value) => Array.isArray(value) ? value : []);
  for (const value of declaredOutput) {
    const kind = String(value).toLowerCase().replace(/[-_]/g, '');
    const canonical = ({ image: 'image', audio: 'audio', video: 'video', text: 'text', model3d: 'model3d', spatial: 'spatial' })[kind];
    if (canonical) output[canonical] = true;
  }
  const requestText = latestUserMessageText(body);
  if (/\b(?:generate|create|draw|render|paint|make)\b[^.!?\n]{0,100}\b(?:image|picture|illustration|artwork)\b/i.test(requestText)) output.image = true;
  if (/\b(?:speak|read|say)\b[^.!?\n]{0,80}\b(?:aloud|out loud|as audio|in audio)\b|\b(?:text[- ]to[- ]speech|generate|create|produce)\b[^.!?\n]{0,80}\b(?:speech|spoken audio|audio clip)\b/i.test(requestText)) output.audio = true;
  if (/\b(?:generate|create|make|render|produce|animate)\b[^.!?\n]{0,100}\b(?:video|clip|animation)\b/i.test(requestText)) output.video = true;
  if (/\b(?:generate|create|make|build|export|design)\b[^.!?\n]{0,100}\b(?:3d\s+(?:model|mesh|scene|asset)|mesh|point cloud)\b/i.test(requestText)) output.model3d = true;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (const message of messages) {
    if (typeof message?.content === 'string' && message.content.trim()) input.text = true;
    if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (typeof part === 'string' && part.trim()) input.text = true;
        else if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) input.text = true;
        inspectContentPart(part, found);
      }
    }
  }
  const command = /^\s*\/([a-z0-9-]+)\b/i.exec(latestUserMessageText(body))?.[1]?.toLowerCase();
  const mediaIntent = MEDIA_SLASH_INTENTS[command];
  if (mediaIntent?.direction === 'output') output[mediaIntent.kind] = true;
  if (mediaIntent?.direction === 'input' && !input[mediaIntent.kind]) input[mediaIntent.kind] = false;
  const generalOutputCommand = ({ image: 'image', draw: 'image', imagine: 'image', tts: 'audio', speak: 'audio' })[command];
  if (generalOutputCommand) output[generalOutputCommand] = true;
  for (const kind of MEDIA_TYPES) found[kind] = input[kind];
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
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messageText(messages[index]);
  }
  return '';
}

export function audioDataFromBody(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (const message of messages) {
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
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const text = messages.flatMap((message) => typeof message?.content === 'string' ? [message.content] : []).join('\n');
  return /\btranslate\b|\btranslation\b/i.test(text);
}

const ROUTER_SENTINELS = new Set(['auto', NEXUS_ALIAS]);

export function isRouterSentinel(alias, _registry) {
  if (!alias) return true;
  if (ROUTER_SENTINELS.has(alias)) return true;
  // Unknown aliases are NOT sentinels — they must 400, not fall through to nexus.
  return false;
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
  return agentCanAdmit(agent, {
    freeMemoryBytes,
    admitWhenTight: admitWhenTightOf(processes?.manifest ?? registry?.manifest),
  }).ok;
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

export function isAutoModelId(alias) {
  if (alias == null || alias === '') return true;
  const id = String(alias);
  if (ROUTER_SENTINELS.has(id)) return true;
  return AUTO_MODEL_IDS.has(id.toLowerCase());
}

/**
 * Pure P0 pin policy for explicit client `model` values (DISPATCH-FIX-01).
 * unknown → ValidationError 400; known unavailable → pin (gateway 503); auto/compat → nexus.
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
    throw new ValidationError(`Unknown agent alias: ${stripControls(alias)}`, { allowed });
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

/** Continue / curl / ChatGPT-compat clients. llama.app last-alias (e.g. after /code) is not this. */
export function isGenericChatRequest(body) {
  const requested = body?.model;
  if (requested == null || requested === '') return true;
  const id = String(requested).toLowerCase();
  if (AUTO_MODEL_IDS.has(id)) return true;
  if (id === 'general-text-speculator') return true;
  return false;
}

const SLASH_ALIASES = Object.freeze({
  vision: 'vision-layout-agent',
  audio: 'audio-transcription-agent',
  transcribe: 'audio-transcription-agent',
  transcript: 'audio-transcription-agent',
  code: 'code-generation-agent',
  cpp: 'code-generation-agent',
  text: 'general-text-speculator',
  chat: 'general-text-speculator',
  embed: 'semantic-embedding-agent',
  rerank: 'retrieval-rerank-agent',
  router: NEXUS_ALIAS,
  guard: 'safety-policy-agent',
  safety: 'safety-policy-agent',
  tts: 'speech-synthesis-agent',
  speak: 'speech-synthesis-agent',
  image: 'image-generation-agent',
  imagine: 'image-generation-agent',
  draw: 'image-generation-agent',
  // Security & Audit Dispatches
  sast: 'code-generation-agent',
  audit: 'code-generation-agent',
  cwe: 'code-generation-agent',
  threatmodel: 'general-text-speculator',
  stride: 'general-text-speculator',
  osint: 'general-text-speculator',
  recon: 'general-text-speculator',
  threatintel: 'general-text-speculator',
  ioc: 'general-text-speculator',
  forensics: 'general-text-speculator',
  dfir: 'general-text-speculator',
  siem: 'code-generation-agent',
  rules: 'code-generation-agent',
  sigma: 'code-generation-agent',
  yara: 'code-generation-agent',
  harden: 'general-text-speculator',
  sysprep: 'general-text-speculator',
  sbom: 'code-generation-agent',
  deps: 'code-generation-agent',
  monitor: MONITOR_ALIAS,
  secmon: MONITOR_ALIAS,
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
  'safety-policy-agent': { path: '/v1/moderations', kind: 'moderation' },
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
  const match = /^\/([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/i.exec(unfenced);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const rawRest = (match[2] ?? '').trim();
  if (token === 'forget') {
    throw new ValidationError('/forget is not a proven phenomenon; use /rebuke to correct');
  }
  if (MEDIA_SLASH_INTENTS[token]) return { token, alias: null, rest: rawRest, modalityIntent: MEDIA_SLASH_INTENTS[token] };
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
    const { head, rest: afterHead } = takeToken(rawRest);
    const toggle = head === 'on' || head === 'off' ? head : null;
    const c = parseCouncilArgs(toggle ? afterHead : rawRest);
    const spec = { targets: c.targets, judge: c.judge, parallel: c.parallel };
    const out = { token, alias: null, rest: c.rest, council: spec };
    if (toggle) {
      out.setting = 'council';
      out.councilDefault = toggle === 'on' ? spec : null;
      out.settingOnly = !c.rest;
      if (toggle === 'off' || !c.rest) delete out.council; // nothing to run this turn
    }
    return out;
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
  // DISPATCH-FIX-01: unknown → 400; unavailable → pin (503 at gateway); sticky available without lock → nexus.
  const pin = resolveExplicitModelPin(requested, registry, { lockAlias: body.lock_alias === true });
  if (pin.decision === 'pin') {
    return finish(body, registry, pin.alias, pin.reason, modality);
  }
  return finish(body, registry, null, 'nexus', modality);
}

/** Agency code-switch: choose a specialist register. Do not speak as that specialist. */
export function routeRequest(body, registry, _sessionAgent) {
  return hardRuleRoute(body, registry);
}
