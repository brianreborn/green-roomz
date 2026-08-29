import { Readable } from 'node:stream';
import { HANDOFF_PEEK_CHARS } from './constants.mjs';
import { sanitizeCompletionJson } from './proxy.mjs';
import { extractJsonObject, stripFence } from './nexus.mjs';

const SUGGEST_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function safeSuggest(value) {
  if (value == null || value === 'null') return null;
  const alias = String(value).trim();
  if (!SUGGEST_RE.test(alias)) return null;
  if (alias === 'auto' || alias === 'tool-router-agent') return null;
  return alias;
}

function safeReason(value, fallback) {
  return String(value ?? fallback ?? 'handoff').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/[ \t]{2,}/g, ' ').trim().slice(0, 240);
}

export function parseHandoffContent(text) {
  const trimmed = String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '').trim();
  if (!trimmed) return null;
  if (/^HANDOFF\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^HANDOFF\s*/i, '').trim();
    let reason = rest || 'not my job';
    let suggest = null;
    const obj = rest ? extractJsonObject(stripFence(rest)) : null;
    if (obj) {
      reason = obj.reason ?? reason;
      suggest = obj.suggest ?? null;
    }
    return { handoff: true, reason: safeReason(reason, 'not my job'), suggest: safeSuggest(suggest) };
  }
  const obj = extractJsonObject(stripFence(trimmed));
  if (obj && obj.handoff === true) {
    return { handoff: true, reason: safeReason(obj.reason, 'handoff'), suggest: safeSuggest(obj.suggest) };
  }
  return null;
}

export function isHandoffContent(text) {
  return Boolean(parseHandoffContent(text));
}

function contentFromChoice(json) {
  const choice = json?.choices?.[0];
  if (!choice) return '';
  return String(choice.delta?.content ?? choice.message?.content ?? '');
}

function parseSseBlock(raw) {
  const data = String(raw).split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  if (data === '[DONE]') return { done: true };
  try {
    return { json: JSON.parse(data) };
  } catch {
    return { raw: data };
  }
}

class SseParser {
  constructor() {
    this.carry = '';
    this.decoder = new TextDecoder();
  }

  push(chunk) {
    this.carry += this.decoder.decode(chunk, { stream: true });
    return this.take();
  }

  end() {
    this.carry += this.decoder.decode();
    return this.take(true);
  }

  take(ended = false) {
    const events = [];
    const text = this.carry.replace(/\r\n/g, '\n');
    let pos = 0;
    while (true) {
      const sep = text.indexOf('\n\n', pos);
      if (sep === -1) break;
      const parsed = parseSseBlock(text.slice(pos, sep));
      pos = sep + 2;
      if (parsed) events.push(parsed);
    }
    this.carry = text.slice(pos);
    if (ended && this.carry.trim()) {
      const parsed = parseSseBlock(this.carry);
      if (parsed) events.push(parsed);
      this.carry = '';
    }
    return events;
  }
}

function assembleCompletion(events, { model, keepReasoning = false } = {}) {
  let content = '';
  let finishReason = 'stop';
  let id = 'grz-completion';
  let usedModel = model ?? '';
  for (const event of events) {
    const json = event.json;
    if (!json) continue;
    id = json.id ?? id;
    usedModel = json.model ?? usedModel;
    content += contentFromChoice(json);
    const reason = json.choices?.[0]?.finish_reason;
    if (reason) finishReason = reason;
  }
  return sanitizeCompletionJson({
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: usedModel,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }, { keepReasoning });
}

function clientAskedForReasoning(body) {
  return body?.enable_thinking === true || body?.chat_template_kwargs?.enable_thinking === true;
}

function clientWantsStream(body, request) {
  if (body?.stream === true) return true;
  const accept = request?.headers?.accept ?? '';
  return String(accept).includes('text/event-stream');
}

async function readJsonBody(upstream) {
  if (typeof upstream.text === 'function') return upstream.text();
  if (typeof upstream.json === 'function') return JSON.stringify(await upstream.json());
  if (!upstream.body) return '';
  const reader = upstream.body.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

export async function peekSpecialist({ fetchImpl = fetch, request, target, body, signal, peekChars = HANDOFF_PEEK_CHARS } = {}) {
  const keepReasoning = clientAskedForReasoning(body);
  const payload = { ...body, stream: true };
  const headers = new Headers();
  for (const [key, value] of Object.entries(request?.headers ?? {})) {
    const lower = key.toLowerCase();
    if (!value || !['content-type', 'accept', 'idempotency-key'].includes(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('content-type', 'application/json');
  const hopAbort = new AbortController();
  const onParent = () => hopAbort.abort();
  signal?.addEventListener?.('abort', onParent, { once: true });
  let upstream;
  try {
    upstream = await fetchImpl(target, {
      method: request?.method ?? 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: hopAbort.signal,
    });
  } catch (error) {
    signal?.removeEventListener?.('abort', onParent);
    throw error;
  }

  if (upstream.status >= 400) {
    signal?.removeEventListener?.('abort', onParent);
    const raw = await readJsonBody(upstream);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { error: { message: raw, type: 'upstream_error' } }; }
    return { status: upstream.status, error: parsed, finished: true, handoff: null, hopAbort };
  }

  if (!upstream.body) {
    signal?.removeEventListener?.('abort', onParent);
    const raw = await readJsonBody(upstream);
    let data;
    try { data = JSON.parse(raw); } catch { data = { choices: [{ message: { role: 'assistant', content: raw }, finish_reason: 'stop' }] }; }
    const content = data.choices?.[0]?.message?.content ?? '';
    return {
      status: upstream.status,
      handoff: parseHandoffContent(content),
      assembled: sanitizeCompletionJson(data, { keepReasoning }),
      content,
      finished: true,
      events: [],
      reader: null,
      hopAbort,
      keepReasoning,
    };
  }

  const reader = upstream.body.getReader();
  const parser = new SseParser();
  const events = [];
  let content = '';
  let finished = false;
  try {
    while (content.length < peekChars && !finished) {
      const { done, value } = await reader.read();
      if (done) {
        for (const event of parser.end()) {
          if (event.done) { finished = true; continue; }
          if (event.json) {
            events.push(event);
            content += contentFromChoice(event.json);
            if (event.json.choices?.[0]?.finish_reason) finished = true;
          }
        }
        break;
      }
      for (const event of parser.push(value)) {
        if (event.done) { finished = true; continue; }
        if (event.json) {
          events.push(event);
          content += contentFromChoice(event.json);
          if (event.json.choices?.[0]?.finish_reason) finished = true;
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }

  const handoff = parseHandoffContent(content);
  if (handoff) {
    hopAbort.abort();
    try { await reader.cancel(); } catch {}
    signal?.removeEventListener?.('abort', onParent);
    return { status: upstream.status, handoff, content, finished: true, events, reader: null, hopAbort, keepReasoning };
  }

  return {
    status: upstream.status,
    handoff: null,
    content,
    finished,
    events,
    reader,
    parser,
    hopAbort,
    keepReasoning,
    onParent,
    signal,
    model: body?.model,
  };
}

async function drainToEvents(peek) {
  const events = [...(peek.events ?? [])];
  let finished = peek.finished;
  if (!peek.reader) return { events, finished: true };
  try {
    while (!finished) {
      const { done, value } = await peek.reader.read();
      if (done) {
        for (const event of peek.parser.end()) {
          if (event.done) { finished = true; continue; }
          if (event.json) events.push(event);
        }
        break;
      }
      for (const event of peek.parser.push(value)) {
        if (event.done) { finished = true; continue; }
        if (event.json) {
          events.push(event);
          if (event.json.choices?.[0]?.finish_reason) finished = true;
        }
      }
    }
  } finally {
    peek.signal?.removeEventListener?.('abort', peek.onParent);
  }
  return { events, finished: true };
}

function writeSse(response, json) {
  response.write(`data: ${JSON.stringify(json)}\n\n`);
}

export async function deliverPeek({ peek, request, response, body, headers = {} }) {
  if (peek.error) {
    const data = Buffer.from(JSON.stringify(peek.error));
    response.writeHead(peek.status ?? 502, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, ...headers });
    return response.end(data);
  }

  const keepReasoning = peek.keepReasoning ?? clientAskedForReasoning(body);
  const stream = clientWantsStream(body, request);

  if (peek.assembled && peek.finished) {
    if (!stream) {
      const data = Buffer.from(JSON.stringify(peek.assembled));
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, ...headers });
      return response.end(data);
    }
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', ...headers });
    const content = peek.assembled.choices?.[0]?.message?.content ?? '';
    writeSse(response, {
      id: peek.assembled.id ?? 'grz',
      object: 'chat.completion.chunk',
      model: peek.assembled.model,
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: peek.assembled.choices?.[0]?.finish_reason ?? 'stop' }],
    });
    response.write('data: [DONE]\n\n');
    return response.end();
  }

  if (stream) {
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', ...headers });
    for (const event of peek.events ?? []) {
      if (event.json) writeSse(response, sanitizeCompletionJson(event.json, { keepReasoning }));
    }
    if (peek.finished || !peek.reader) {
      response.write('data: [DONE]\n\n');
      peek.signal?.removeEventListener?.('abort', peek.onParent);
      return response.end();
    }
    try {
      while (true) {
        const { done, value } = await peek.reader.read();
        if (done) {
          for (const event of peek.parser?.end?.() ?? []) {
            if (event.done) continue;
            if (event.json) writeSse(response, sanitizeCompletionJson(event.json, { keepReasoning }));
          }
          break;
        }
        for (const event of peek.parser?.push?.(value) ?? []) {
          if (event.done) continue;
          if (event.json) writeSse(response, sanitizeCompletionJson(event.json, { keepReasoning }));
        }
      }
    } finally {
      peek.signal?.removeEventListener?.('abort', peek.onParent);
    }
    response.write('data: [DONE]\n\n');
    return response.end();
  }

  const drained = await drainToEvents(peek);
  const assembled = assembleCompletion(drained.events, { model: peek.model ?? body?.model, keepReasoning });
  const data = Buffer.from(JSON.stringify(assembled));
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, ...headers });
  return response.end(data);
}

export function sseFromJson(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? '';
  const stream = [
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  return Readable.toWeb(Readable.from([Buffer.from(stream)]));
}
