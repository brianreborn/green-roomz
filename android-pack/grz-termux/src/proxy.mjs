import { Readable } from 'node:stream';
import { jitteredBackoff, sleep, stripEscapes } from './util.mjs';

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

export async function proxyJson({ request, response, body, target, config, signal, fetchImpl = fetch }) {
  const payload = Buffer.from(JSON.stringify(body));
  const idempotencyKey = request.headers['idempotency-key'];
  const deadline = Date.now() + config.retry_deadline_ms;
  let attempt = 0;
  const keepReasoning = clientAskedForReasoning(body);
  while (true) {
    try {
      const upstream = await fetchImpl(target, { method: request.method, headers: upstreamHeaders(request), body: payload, signal });
      if (upstream.status === 503 && idempotencyKey && Date.now() < deadline) {
        await upstream.body?.cancel();
        await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
        continue;
      }
      const canSanitize = !body?.stream && typeof upstream.text === 'function';
      if (canSanitize) {
        const raw = await upstream.text();
        const headers = downstreamHeaders(upstream);
        delete headers['content-length'];
        let data;
        try {
          data = Buffer.from(JSON.stringify(sanitizeCompletionJson(JSON.parse(raw), { keepReasoning })));
        } catch {
          data = Buffer.from(raw);
        }
        response.writeHead(upstream.status, { ...headers, 'content-length': data.length });
        return response.end(data);
      }
      response.writeHead(upstream.status, downstreamHeaders(upstream));
      if (!upstream.body) return response.end();
      Readable.fromWeb(upstream.body).pipe(response);
      return;
    } catch (error) {
      const code = error.cause?.code ?? error.code;
      if (code !== 'ECONNREFUSED' || Date.now() >= deadline) throw error;
      await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
    }
  }
}
