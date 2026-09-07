import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { UPSTREAM_MAX_BUFFER_BYTES, UPSTREAM_TIMEOUT_MS } from './constants.mjs';
import { UpstreamProtocolError, UpstreamTimeoutError } from './errors.mjs';
import { deadlineSignal, isTimeoutAbort, jitteredBackoff, readCappedText, sleep, stripEscapes } from './util.mjs';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const UPSTREAM_HEADER_ALLOW = new Set(['content-type', 'accept', 'idempotency-key']);

export function upstreamHeaders(request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    const lower = key.toLowerCase();
    if (!value || HOP_BY_HOP.has(lower) || !UPSTREAM_HEADER_ALLOW.has(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('content-type', 'application/json');
  return headers;
}

function downstreamHeaders(response) {
  const headers = {};
  for (const [key, value] of response.headers) if (!HOP_BY_HOP.has(key.toLowerCase())) headers[key] = value;
  return headers;
}

export function sanitizeCompletionJson(payload, { keepReasoning = false } = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const next = { ...payload };
  delete next.timings;
  if (Array.isArray(next.choices)) {
    next.choices = next.choices.map((choice) => {
      if (!choice || typeof choice !== 'object') return choice;
      const copy = { ...choice };
      if (copy.message && typeof copy.message === 'object') {
        const message = { ...copy.message };
        if (!keepReasoning) {
          delete message.reasoning;
          delete message.reasoning_content;
        }
        if (typeof message.content === 'string') message.content = stripEscapes(message.content);
        copy.message = message;
      }
      if (copy.delta && typeof copy.delta === 'object') {
        const delta = { ...copy.delta };
        if (!keepReasoning) {
          delete delta.reasoning;
          delete delta.reasoning_content;
        }
        if (typeof delta.content === 'string') delta.content = stripEscapes(delta.content);
        copy.delta = delta;
      }
      return copy;
    });
  }
  return next;
}

function clientAskedForReasoning(body) {
  return body?.enable_thinking === true || body?.chat_template_kwargs?.enable_thinking === true;
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

export function sanitizeSseText(raw, { keepReasoning = false } = {}) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n');
  const out = [];
  let pos = 0;
  while (true) {
    const sep = text.indexOf('\n\n', pos);
    if (sep === -1) break;
    const parsed = parseSseBlock(text.slice(pos, sep));
    pos = sep + 2;
    if (!parsed) continue;
    if (parsed.done) out.push('data: [DONE]\n\n');
    else if (parsed.json) out.push(`data: ${JSON.stringify(sanitizeCompletionJson(parsed.json, { keepReasoning }))}\n\n`);
    else if (parsed.raw) out.push(`data: ${parsed.raw}\n\n`);
  }
  const rest = text.slice(pos);
  if (rest.trim()) {
    const parsed = parseSseBlock(rest);
    if (parsed?.done) out.push('data: [DONE]\n\n');
    else if (parsed?.json) out.push(`data: ${JSON.stringify(sanitizeCompletionJson(parsed.json, { keepReasoning }))}\n\n`);
  }
  return out.join('');
}

async function writeSanitizedSse(upstream, response, { keepReasoning, signal } = {}) {
  const headers = downstreamHeaders(upstream);
  delete headers['content-length'];
  if (response.writableEnded) {
    try { await upstream.body?.cancel?.(); } catch {}
    return;
  }
  response.writeHead(upstream.status, { ...headers, 'content-type': headers['content-type'] || 'text/event-stream; charset=utf-8' });
  if (!upstream.body) {
    if (typeof upstream.text === 'function') {
      const raw = await upstream.text();
      if (typeof response.write === 'function') response.write(sanitizeSseText(raw, { keepReasoning }));
      else return response.end(sanitizeSseText(raw, { keepReasoning }));
    }
    return response.end();
  }
  if (typeof upstream.body.getReader !== 'function') {
    if (typeof upstream.text === 'function') {
      const raw = await upstream.text();
      if (typeof response.write === 'function') response.write(sanitizeSseText(raw, { keepReasoning }));
    }
    return response.end();
  }
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      carry = carry.replace(/\r\n/g, '\n');
      let pos = 0;
      while (true) {
        const sep = carry.indexOf('\n\n', pos);
        if (sep === -1) break;
        const parsed = parseSseBlock(carry.slice(pos, sep));
        pos = sep + 2;
        if (!parsed) continue;
        const frame = parsed.done
          ? 'data: [DONE]\n\n'
          : parsed.json
            ? `data: ${JSON.stringify(sanitizeCompletionJson(parsed.json, { keepReasoning }))}\n\n`
            : `data: ${parsed.raw}\n\n`;
        if (typeof response.write === 'function') response.write(frame);
      }
      carry = carry.slice(pos);
    }
    carry += decoder.decode();
    if (carry.trim()) {
      const parsed = parseSseBlock(carry);
      if (parsed?.json && typeof response.write === 'function') {
        response.write(`data: ${JSON.stringify(sanitizeCompletionJson(parsed.json, { keepReasoning }))}\n\n`);
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return response.end();
}

export async function proxyJson({ request, response, body, target, config, signal, fetchImpl = fetch, beforeClientWrite }) {
  const payload = Buffer.from(JSON.stringify(body));
  const idempotencyKey = request.headers['idempotency-key'];
  const deadline = Date.now() + config.retry_deadline_ms;
  const upstreamTimeout = config.upstream_timeout_ms ?? UPSTREAM_TIMEOUT_MS;
  const maxBuffer = config.upstream_max_buffer_bytes ?? UPSTREAM_MAX_BUFFER_BYTES;
  let attempt = 0;
  const keepReasoning = clientAskedForReasoning(body);
  while (true) {
    const attemptSignal = deadlineSignal(signal, upstreamTimeout);
    try {
      const upstream = await fetchImpl(target, { method: request.method, headers: upstreamHeaders(request), body: payload, signal: attemptSignal });
      if (upstream.status === 503 && idempotencyKey && Date.now() < deadline) {
        try { await upstream.body?.cancel(); } catch {}
        await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
        continue;
      }
      if (body?.stream) {
        try {
          if (beforeClientWrite) await beforeClientWrite();
          await writeSanitizedSse(upstream, response, { keepReasoning, signal: attemptSignal });
        } catch (streamError) {
          if (!response.writableEnded) response.destroy?.(streamError);
        }
        return { status: upstream.status };
      }
      const canSanitize = typeof upstream.text === 'function' || upstream.body;
      if (canSanitize) {
        let raw;
        try {
          raw = await readCappedText(upstream, maxBuffer);
        } catch (readError) {
          if (readError?.code === 'UPSTREAM_TOO_LARGE') {
            throw new UpstreamProtocolError('upstream response exceeded buffer cap', { maxBuffer });
          }
          throw readError;
        }
        const headers = downstreamHeaders(upstream);
        delete headers['content-length'];
        let data;
        try {
          data = Buffer.from(JSON.stringify(sanitizeCompletionJson(JSON.parse(raw), { keepReasoning })));
        } catch {
          data = Buffer.from(raw);
        }
        if (response.writableEnded) return { status: upstream.status };
        if (beforeClientWrite) await beforeClientWrite();
        response.writeHead(upstream.status, { ...headers, 'content-length': data.length });
        response.end(data);
        return { status: upstream.status };
      }
      if (response.writableEnded) {
        try { await upstream.body?.cancel(); } catch {}
        return { status: upstream.status };
      }
      if (beforeClientWrite) await beforeClientWrite();
      response.writeHead(upstream.status, downstreamHeaders(upstream));
      if (!upstream.body) {
        response.end();
        return { status: upstream.status };
      }
      try {
        await pipeline(Readable.fromWeb(upstream.body), response, { signal: attemptSignal });
      } catch (streamError) {
        // Client gone or upstream stalled mid-stream: tear the socket down, do not rethrow
        // into the handler (headers are already sent).
        if (!response.writableEnded) response.destroy(streamError);
      }
      return { status: upstream.status };
    } catch (error) {
      if (isTimeoutAbort(error, signal)) {
        throw new UpstreamTimeoutError('upstream backend timed out', { target: redactTarget(target), timeout_ms: upstreamTimeout });
      }
      if (signal?.aborted) throw error;
      const code = error.cause?.code ?? error.code;
      if (code !== 'ECONNREFUSED' || Date.now() >= deadline) throw error;
      await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
    }
  }
}

function redactTarget(target) {
  try { const u = new URL(target); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return 'upstream'; }
}
