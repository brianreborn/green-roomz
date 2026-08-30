import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fieldVote, similarityVote, resolveJudgeChoice, judgePrompt } from './council.mjs';
import { AGENCY_ROLE, DEFAULT_FAITH, DEFAULT_FEAR, FALLBACK_ALIAS, MAX_SPECIALIST_HOPS, MONITOR_ALIAS, NEXUS_ALIAS, REBUKE_OP, UPSTREAM_MAX_BUFFER_BYTES, UPSTREAM_TIMEOUT_MS, YOLO_TOKEN } from './constants.mjs';
import { loadDeclaredKernel } from './config.mjs';
import { compileStockPrompt } from './compile-prompt.mjs';
import { Mailbox } from './mailbox.mjs';
import { CAP, MonitorIpc } from './monitor/ipc.mjs';
import { createLogger } from './monitor/logger.mjs';
import { GreenRoomzError, UnavailableError, UpstreamProtocolError, UpstreamTimeoutError, ValidationError } from './errors.mjs';
import { deliverPeek, peekSpecialist } from './handoff.mjs';
import { consultNexus } from './nexus.mjs';
import { planRoute } from './logical-router.mjs';
import { proxyJson } from './proxy.mjs';
import { aliasCanAdmit, audioDataFromBody, detectModalities, hardRuleRoute, isRoutableAlias, latestUserMessageText, NATIVE_CHAT, parseSlashCommand, stripSlashCommand } from './routing.mjs';
import { deadlineSignal, headerSafe, isTimeoutAbort, jsonResponse, readCappedText, redact, secureEquals, stripControls } from './util.mjs';

const EXPLICIT_ROUTES = new Set([
  '/health',
  '/v1/health',
  '/v1/models',
  '/props',
  '/metrics',
  '/v1/monitor/recent',
  '/v1/chat/completions',
  '/v1/chat/completions/route',
  '/v1/embeddings',
  '/v1/rerank',
]);

/** 8080 may post/observe hops. No vote / lockdown / reboot / respond rights. */
export const GATEWAY_IPC_RIGHTS = (CAP.POST | CAP.OBSERVE | CAP.SNAPSHOT) >>> 0;

function identityFrom(request, apiKey) {
  const header = request.headers.authorization ?? '';
  if (apiKey) {
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!secureEquals(token, apiKey)) return null;
    return 'authenticated';
  }
  return 'loopback-dev';
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);
const COUNCIL_JUDGES = new Set(['field-vote', 'judge-model', 'similarity']);

/**
 * A council request, from either:
 *   - JSON: `{ "council": true | { of, variants, judge, parallel } }`
 *   - slash: `/council [targets] [judge] [serial|parallel] <prompt>`
 * Resolves the alias set to run: an explicit `variants` list, all variants of
 * `of` / `body.model` / the modality target, or null when there is nothing to
 * fan out to (< 2 aliases).
 */
export function parseCouncilRequest(body, registry) {
  let slashCouncil = null;
  try { slashCouncil = parseSlashCommand(body)?.council ?? null; } catch { slashCouncil = null; }

  const raw = slashCouncil ?? body?.council;
  if (!raw) return null;
  const spec = raw === true ? {} : (typeof raw === 'object' ? raw : null);
  if (!spec) return null;
  const judge = COUNCIL_JUDGES.has(spec.judge) ? spec.judge : 'field-vote';

  const explicit = Array.isArray(spec.variants) ? spec.variants
    : (Array.isArray(spec.targets) && spec.targets.length > 1 ? spec.targets : null);
  let aliases = explicit ? explicit.filter((a) => registry.agents.has(a)) : null;
  if (!aliases || aliases.length < 2) {
    const mod = detectModalities(body);
    const modalityBase = mod.image ? 'vision-layout-agent' : mod.audio ? 'audio-transcription-agent' : null;
    const base = String(
      spec.of || (Array.isArray(spec.targets) ? spec.targets[0] : spec.targets) || body.model || modalityBase || '',
    ).replace(/@.*$/, '');
    if (base && registry.agents.has(base)) {
      aliases = [base, ...[...registry.agents.keys()].filter((a) => a.startsWith(`${base}@`))];
    }
  }
  if (!aliases || aliases.length < 2) return null;
  return { aliases: [...new Set(aliases)], judge, parallel: spec.parallel };
}

/** Normalize a Node remoteAddress (drops the v4-in-v6 prefix). */
export function normalizeAddr(addr) {
  const a = String(addr ?? '').trim();
  return a.startsWith('::ffff:') ? a.slice(7) : a;
}

function ipToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n * 256) + o;
  }
  return n >>> 0;
}

/** True if `addr` is loopback, listed exactly, or inside a listed IPv4 CIDR. */
export function peerAllowed(addr, allowPeers = []) {
  const ip = normalizeAddr(addr);
  if (!ip || LOOPBACK.has(ip)) return true;
  for (const rule of allowPeers) {
    const r = String(rule).trim();
    if (r === ip) return true;
    if (r.includes('/')) {
      const [net, bitsRaw] = r.split('/');
      const bits = Number(bitsRaw);
      const a = ipToLong(ip);
      const b = ipToLong(net);
      if (a != null && b != null && bits >= 0 && bits <= 32) {
        const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
        if ((a & mask) === (b & mask)) return true;
      }
    }
  }
  return false;
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        request.destroy();
        reject(new ValidationError('Request body exceeds configured limit', { limit }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function corsHeaders(manifest, origin) {
  const allowed = manifest.gateway?.cors_origins ?? [];
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type, x-session-id, idempotency-key',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
}

/** The compiled stock prompt (frames + kernel); the raw kernel if frames are unavailable. */
export function stockSystemPrompt(agent) {
  const kernelText = loadDeclaredKernel(agent);
  if (!kernelText) return null;
  try {
    return compileStockPrompt(agent, { kernelText });
  } catch {
    return kernelText; // frames dir missing, or nexus kernel over-bound: fail safe to the kernel
  }
}

export function injectSystemPolicy(body, agent) {
  const payload = { ...body };
  const policy = stockSystemPrompt(agent);
  if (!policy) return payload;
  const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  const marker = policy.trim().slice(0, 24);
  if (messages.some((message) => message?.role === 'system' && String(message.content ?? '').includes(marker))) {
    payload.messages = messages;
    return payload;
  }
  payload.messages = [{ role: 'system', content: policy }, ...messages];
  return payload;
}

export function prepareInferenceBody(body, agent) {
  const stripped = stripSlashCommand(body);
  const payload = injectSystemPolicy({ ...stripped, model: agent.alias }, agent);
  delete payload.route_plan_only;
  delete payload.lock_alias;
  delete payload.session_id;
  if (agent.alias === NEXUS_ALIAS) {
    payload.enable_thinking = false;
    payload.chat_template_kwargs = { ...(payload.chat_template_kwargs ?? {}), enable_thinking: false };
    return payload;
  }
  if (agent.alias !== FALLBACK_ALIAS) return payload;
  const explicit = payload.enable_thinking ?? payload.chat_template_kwargs?.enable_thinking;
  if (explicit !== undefined) return payload;
  payload.chat_template_kwargs = { ...(payload.chat_template_kwargs ?? {}), enable_thinking: false };
  return payload;
}

function wantsRoutePlan(body, pathname) {
  return body?.route_plan_only === true || String(pathname ?? '').endsWith('/route');
}

function isChatPath(pathname) {
  const path = String(pathname ?? '').replace(/\/route$/, '') || '/v1/chat/completions';
  return path === '/v1/chat/completions' || path.endsWith('/chat/completions');
}

function wrapNativeAsChat(alias, nativeJson, kind) {
  let content;
  if (typeof nativeJson === 'string') content = nativeJson;
  else if (kind === 'whisper' && typeof nativeJson?.text === 'string') content = nativeJson.text.trim();
  else if (kind === 'image') {
    const item = nativeJson?.data?.[0] ?? {};
    const url = item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    content = url
      ? [{ type: 'image_url', image_url: { url } }]
      : JSON.stringify(nativeJson);
  }
  else content = JSON.stringify(nativeJson);
  return {
    id: `grz-native-${alias}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: alias,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function nativePayload(kind, body, alias) {
  const text = latestUserMessageText(stripSlashCommand(body));
  if (kind === 'embeddings') return { model: alias, input: text };
  if (kind === 'rerank') {
    const lines = String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      throw new ValidationError('/rerank needs a query line then one document per following line');
    }
    return { model: alias, query: lines[0], documents: lines.slice(1) };
  }
  if (kind === 'whisper') {
    const audio = audioDataFromBody(body);
    if (!audio) throw new ValidationError('/audio requires an attached audio part');
    return { audio_data: audio };
  }
  if (kind === 'image') {
    const prompt = String(text ?? '').trim();
    if (!prompt) throw new ValidationError('image generation needs a text prompt');
    return { prompt, n: 1, response_format: 'b64_json' };
  }
  return body;
}

/** data:audio/wav;base64,AAAA  ->  { bytes: Buffer, mime: 'audio/wav', ext: 'wav' } */
export function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl ?? ''));
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
  return { bytes, mime, ext };
}

/** Shape the outbound request per native backend: whisper wants multipart, the rest JSON. */
function nativeRequestInit(kind, payload, signal) {
  if (kind === 'whisper') {
    const decoded = decodeDataUrl(payload.audio_data);
    if (!decoded) throw new ValidationError('audio part is not a decodable data: URL');
    const form = new FormData();
    form.set('file', new Blob([decoded.bytes], { type: decoded.mime }), `audio.${decoded.ext}`);
    form.set('response_format', 'json');
    form.set('temperature', '0');
    return { method: 'POST', body: form, signal, headers: { connection: 'close' } };
  }
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', connection: 'close' },
    body: JSON.stringify(payload),
    signal,
  };
}

export class Gateway {
  constructor({ manifest, registry, processes, sessions, policy, hostAdapter, fetchImpl, mailbox, ipc, logger }) {
    this.manifest = manifest;
    this.registry = registry;
    this.processes = processes;
    this.sessions = sessions;
    this.policy = policy;
    this.hostAdapter = hostAdapter;
    this.fetchImpl = fetchImpl ?? fetch;
    this.apiKey = process.env.GREEN_ROOMZ_API_KEY || '';
    this.startedAt = Date.now();
    this.mailbox = mailbox ?? new Mailbox();
    this.ipc = ipc ?? new MonitorIpc({
      rightsMask: GATEWAY_IPC_RIGHTS,
      role: 'green-roomz',
    });
    this.logger = logger ?? createLogger();
    this.extraPeers = [];
    this.councilDir = this.manifest.gateway?.council_dir ?? process.env.GREEN_ROOMZ_COUNCIL_DIR ?? null;
  }

  /** Static manifest allow_peers plus any injected at launch (e.g. by the adb harness). */
  effectivePeers() {
    return [...(this.manifest.gateway.allow_peers ?? []), ...this.extraPeers];
  }

  /** Launch harness hook: trust these peer IPs/CIDRs for this process only. */
  addPeers(peers = []) {
    for (const p of peers) if (p && !this.extraPeers.includes(p)) this.extraPeers.push(String(p));
    return this.effectivePeers();
  }

  bindAddress(host) {
    const requested = host ?? this.manifest.gateway.host ?? '127.0.0.1';
    const loopback = requested === '127.0.0.1' || requested === 'localhost' || requested === '::1';
    const bindAll = requested === '0.0.0.0' || requested === '::';
    const allowPeers = this.manifest.gateway.allow_peers ?? [];
    if (!loopback) {
      // Binding to a specific LAN address is allowed when an explicit peer
      // allowlist is set (the allowlist is the gate) OR an API key is configured.
      // Binding to 0.0.0.0/:: (every interface) still needs the explicit override.
      const gated = allowPeers.length > 0 || this.extraPeers.length > 0 || Boolean(this.apiKey);
      if (bindAll && process.env.GREEN_ROOMZ_ALLOW_PUBLIC !== '1') {
        throw new ValidationError('Binding to all interfaces requires GREEN_ROOMZ_ALLOW_PUBLIC=1; prefer a specific host + gateway.allow_peers');
      }
      if (!bindAll && !gated) {
        throw new ValidationError('Non-loopback binding requires gateway.allow_peers (a peer IP list) or GREEN_ROOMZ_API_KEY');
      }
    }
    return requested;
  }

  async handle(request, response) {
    const origin = request.headers.origin;
    const cors = corsHeaders(this.manifest, origin);
    const abort = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) abort.abort();
    });
    request.abortSignal = abort.signal;
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors);
      return response.end();
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      const remote = request.socket?.remoteAddress;
      if (!peerAllowed(remote, this.effectivePeers())) {
        return jsonResponse(response, 403, { error: { message: 'Peer not allowed', type: 'forbidden_peer' } }, cors);
      }
      const identity = identityFrom(request, this.apiKey);
      if (!identity) return jsonResponse(response, 401, { error: { message: 'Unauthorized', type: 'auth_error' } }, cors);
      if (!EXPLICIT_ROUTES.has(url.pathname) && !url.pathname.endsWith('/route')) {
        return jsonResponse(response, 404, { error: { message: 'Not found', type: 'not_found' } }, cors);
      }
      if (url.pathname === '/health' || url.pathname === '/v1/health') {
        return jsonResponse(response, 200, this.health(), cors);
      }
      if (url.pathname === '/v1/monitor/recent') {
        return jsonResponse(response, 200, {
          object: 'list',
          data: this.mailbox.recent(),
          stats: this.mailbox.stats(),
          ipc: { data: this.ipc.recent(), stats: this.ipc.stats() },
        }, cors);
      }
      if (url.pathname === '/v1/models') {
        return jsonResponse(response, 200, { object: 'list', data: this.registry.listModels() }, cors);
      }
      if (url.pathname === '/props') {
        return jsonResponse(response, 200, {
          product: 'Green-Roomz',
          policy: this.policy.policy,
          capability_reporting: {
            native_capabilities: 'declared',
            callable_capabilities: 'runtime_checked',
            ready_capabilities: 'loaded_now',
          },
          models: this.registry.listModels(),
        }, cors);
      }
      if (url.pathname === '/metrics') {
        if (this.apiKey && identity !== 'authenticated') return jsonResponse(response, 401, { error: { message: 'Unauthorized' } }, cors);
        return jsonResponse(response, 200, this.metrics(), cors);
      }
      if (request.method !== 'POST') return jsonResponse(response, 405, { error: { message: 'Method not allowed' } }, { allow: 'POST', ...cors });
      const raw = await readBody(request, this.manifest.gateway.request_body_limit_bytes ?? 16 * 1024 * 1024);
      let body = {};
      if (raw.length) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          throw new ValidationError('Request body is not valid JSON');
        }
      }
      if (body == null || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
      }
      if (url.pathname === '/v1/embeddings') body.model = body.model ?? 'semantic-embedding-agent';
      if (url.pathname === '/v1/rerank') body.model = body.model ?? 'retrieval-rerank-agent';
      return await this.handleInference(request, response, body, identity, cors, url.pathname);
    } catch (error) {
      const status = error instanceof GreenRoomzError ? error.status : 500;
      const retryAfter = (error instanceof UnavailableError || error instanceof UpstreamTimeoutError)
        ? { 'retry-after': '2' }
        : {};
      return jsonResponse(response, status, {
        error: {
          message: redact(error.message),
          type: error.code ?? 'internal_error',
          details: error.details,
        },
      }, { ...cors, ...retryAfter });
    }
  }

  health() {
    const models = this.registry.listModels();
    const unavailable = models.filter((model) => model.availability === 'unavailable');
    return {
      status: unavailable.length ? 'degraded' : 'ok',
      product: 'Green-Roomz',
      uptime_ms: Date.now() - this.startedAt,
      policy: this.policy.policy,
      agents: models,
      mailbox: this.mailbox.stats(),
      ipc: this.ipc.stats(),
    };
  }

  metrics() {
    return {
      policy: this.policy.policy,
      in_flight: this.policy.active,
      queued: this.policy.queue.length,
      sessions: this.sessions.entries.size,
      processes: [...this.processes.processes.values()].map((record) => ({
        alias: record.alias,
        pid: record.pid,
        state: record.state,
        profileId: record.profileId,
        resident: Boolean(record.resident),
      })),
      resources: this.hostAdapter?.sampleResources?.() ?? null,
    };
  }

  observeHop(kind, source, extra = {}) {
    try {
      this.mailbox.push({
        kind,
        source: source ?? '',
        ticket: extra.ticket ?? '',
        payload: extra.payload ?? {},
      });
    } catch {}
    try {
      this.ipc.observeHop(kind, source, extra);
    } catch {}
    try {
      const emitted = this.logger.emit({
        kind: kind || 'hop',
        source: source ?? '',
        ticket: extra.ticket ?? '',
        payload: extra.payload ?? {},
      }, { callerRole: 'ipc' });
      if (emitted && typeof emitted.catch === 'function') emitted.catch(() => {});
    } catch {}
  }

  handleMonitorSnapshot(request, response, body, identity, session, cors) {
    const alias = MONITOR_ALIAS;
    const issuedSession = session?.id ?? this.sessions.create({
      identity,
      agentAlias: alias,
      modality: detectModalities(body),
    });
    if (session?.id) this.sessions.setAgentAlias(issuedSession, alias);
    this.observeHop('success', alias, { ticket: issuedSession, payload: { reason: 'mailbox', hops: [alias] } });
    const routed = { requestedAlias: body.model ?? alias, effectiveAlias: alias, reason: 'mailbox' };
    return jsonResponse(response, 200, {
      id: `grz-monitor-${issuedSession}`,
      object: 'chat.completion',
      model: alias,
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ alias, runtime: 'logical', mailbox: this.mailbox.recent(), stats: this.mailbox.stats() }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }, this.routeHeaders(issuedSession, routed, cors, { hops: alias }));
  }

  async completeOnResident(request, response, body, issuedSession, cors, hops, reason) {
    const alias = NEXUS_ALIAS;
    const availability = this.registry.status(alias);
    if (!this.registry.agents.has(alias) || availability.state === 'unavailable') {
      this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: 'resident_unavailable' } });
      throw new UnavailableError(`${alias} is unavailable`, availability.missing);
    }
    const agent = this.registry.get(alias);
    hops.push(alias);
    await this.processes.ensure(agent, { signal: request.abortSignal });
    const payload = { ...prepareInferenceBody(body, agent), stream: false };
    const path = '/v1/chat/completions';
    const target = `http://127.0.0.1:${agent.port}${path}`;
    this.observeHop('success', alias, { ticket: issuedSession, payload: { reason, hops: hops.slice() } });
    this.sessions.setAgentAlias(issuedSession, alias);
    const headers = this.routeHeaders(
      issuedSession,
      { requestedAlias: body.model ?? null, effectiveAlias: alias, reason },
      cors,
      { hops: hops.join(',') },
    );
    for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
    return proxyJson({
      request,
      response,
      body: payload,
      target,
      config: this.manifest.gateway,
      signal: request.abortSignal,
      fetchImpl: this.fetchImpl,
    });
  }

  async completeNativeChat(request, response, body, issuedSession, cors, hops, alias, native, reason) {
    const availability = this.registry.status(alias);
    if (!this.registry.agents.has(alias) || availability.state === 'unavailable') {
      throw new UnavailableError(`${alias} is unavailable`, availability.missing);
    }
    const agent = this.registry.get(alias);
    await this.processes.ensure(agent, { signal: request.abortSignal });
    const payload = nativePayload(native.kind, body, alias);
    const target = `http://127.0.0.1:${agent.port}${native.path}`;
    const upstreamTimeout = this.manifest.gateway.upstream_timeout_ms ?? UPSTREAM_TIMEOUT_MS;
    let upstream;
    try {
      const init = nativeRequestInit(native.kind, payload, deadlineSignal(request.abortSignal, upstreamTimeout));
      upstream = await this.fetchImpl(target, init);
    } catch (error) {
      if (error instanceof GreenRoomzError) throw error;
      if (isTimeoutAbort(error, request.abortSignal)) {
        throw new UpstreamTimeoutError(`${alias} timed out`, { timeout_ms: upstreamTimeout });
      }
      throw error;
    }
    let raw;
    try {
      raw = await readCappedText(upstream, this.manifest.gateway.upstream_max_buffer_bytes ?? UPSTREAM_MAX_BUFFER_BYTES);
    } catch (error) {
      if (error?.code === 'UPSTREAM_TOO_LARGE') throw new UpstreamProtocolError(`${alias} response exceeded buffer cap`);
      throw error;
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
    this.observeHop('success', alias, { ticket: issuedSession, payload: { reason, hops: hops.slice() } });
    this.sessions.setAgentAlias(issuedSession, alias);
    const wrapped = wrapNativeAsChat(alias, parsed, native.kind);
    return jsonResponse(
      response,
      upstream.status >= 400 ? upstream.status : 200,
      wrapped,
      this.routeHeaders(
        issuedSession,
        { requestedAlias: body.model ?? null, effectiveAlias: alias, reason: reason ?? `native_${native.kind}` },
        cors,
        { hops: hops.join(',') },
      ),
    );
  }

  async completeSpeech(request, response, body, issuedSession, cors, hops) {
    const alias = 'speech-synthesis-agent';
    const agent = this.registry.get(alias);
    const availability = this.registry.status(alias);
    if (!agent || (availability.state === 'unavailable' && !(availability.missing ?? []).every((m) => m.startsWith('runtime:')))) {
      throw new UnavailableError(`${alias} is unavailable`, availability.missing);
    }
    const runtime = this.manifest.runtimes[agent.runtime];
    const text = latestUserMessageText(stripSlashCommand(body)).trim();
    if (!text) throw new ValidationError('/tts needs text to speak');
    if (text.length > 4000) throw new ValidationError('/tts text is capped at 4000 characters');

    const execFile = this.execFileImpl ?? (await import('node:child_process')).execFile;
    const { mkdtemp, readFile, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'grz-tts-'));
    const out = path.join(dir, 'speech.wav');
    try {
      await new Promise((resolve, reject) => {
        const child = execFile(runtime.command, ['--model', agent.model, '--output_file', out],
          { timeout: 30_000, windowsHide: true }, (err) => (err ? reject(err) : resolve()));
        child.stdin.end(text);
      });
      const wav = await readFile(out);
      this.observeHop('success', alias, { ticket: issuedSession, payload: { reason: 'tts', hops: hops.slice() } });
      this.sessions.setAgentAlias(issuedSession, alias);
      const dataUrl = `data:audio/wav;base64,${wav.toString('base64')}`;
      return jsonResponse(response, 200, {
        id: `grz-native-${alias}`,
        object: 'chat.completion',
        model: alias,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '', audio: { data: dataUrl, format: 'wav', transcript: text } },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }, this.routeHeaders(issuedSession, { requestedAlias: body.model ?? null, effectiveAlias: alias, reason: 'tts' }, cors, { hops: hops.join(',') }));
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Run the same turn through several model variants, judge the results, return
   * the consensus + which variant was the outlier, and append a scorecard row.
   */
  async handleCouncil(request, response, body, identity, session, cors, pathname, spec) {
    const issuedSession = session?.id ?? this.sessions.create({ identity, agentAlias: spec.aliases[0], modality: detectModalities(body) });
    const stripped = stripSlashCommand(body);
    const path = String((pathname ?? request.url.split('?')[0])).replace(/\/route$/, '') || '/v1/chat/completions';

    const runOne = async (alias) => {
      const t0 = Date.now();
      try {
        const agent = this.registry.get(alias);
        if (!agent || this.registry.status(alias).state === 'unavailable') return { alias, ok: false, content: '', status: 503, ms: Date.now() - t0 };
        await this.processes.ensure(agent, { signal: request.abortSignal });
        const payload = { ...prepareInferenceBody(stripped, agent), stream: false };
        const res = await this.fetchImpl(`http://127.0.0.1:${agent.port}${path}`, {
          method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' },
          body: JSON.stringify(payload), signal: deadlineSignal(request.abortSignal, this.manifest.gateway.upstream_timeout_ms ?? UPSTREAM_TIMEOUT_MS),
        });
        const raw = await readCappedText(res, this.manifest.gateway.upstream_max_buffer_bytes ?? UPSTREAM_MAX_BUFFER_BYTES);
        let content = '';
        try { content = JSON.parse(raw)?.choices?.[0]?.message?.content ?? ''; } catch { content = raw; }
        return { alias, ok: res.status < 400 && content.length > 0, content: String(content), status: res.status, ms: Date.now() - t0 };
      } catch (error) {
        return { alias, ok: false, content: '', status: 0, error: String(error?.message ?? error), ms: Date.now() - t0 };
      }
    };

    // Parallel only if every variant can admit without eviction; else serial
    // (each run evicts the previous - slow, but the memory-tight path).
    const canParallel = spec.parallel ?? spec.aliases.every((a) => aliasCanAdmit(this.registry, a, this.processes) && this.registry.status(a).state === 'ready');
    const candidates = canParallel
      ? await Promise.all(spec.aliases.map(runOne))
      : await spec.aliases.reduce(async (acc, a) => [...(await acc), await runOne(a)], Promise.resolve([]));

    const usable = candidates.filter((c) => c.ok);
    const verdict = await this.judgeCouncil(spec.judge, latestUserMessageText(stripped), usable, request);
    const winnerAlias = verdict.winner ?? usable[0]?.alias ?? candidates[0]?.alias;
    const winnerText = spec.judge === 'field-vote'
      ? JSON.stringify(verdict.consensus)
      : (usable.find((c) => c.alias === winnerAlias)?.content ?? '');

    this.recordCouncil({ task: detectModalities(body).image ? 'vision' : 'text', spec, candidates, verdict });
    this.sessions.setAgentAlias(issuedSession, winnerAlias);

    const headers = this.routeHeaders(issuedSession, { requestedAlias: body.model ?? null, effectiveAlias: winnerAlias, reason: `council_${spec.judge}` }, cors, { hops: spec.aliases.join(',') });
    headers['x-green-roomz-council'] = headerSafe(JSON.stringify({ judge: spec.judge, winner: winnerAlias, outlier: verdict.outlier, agreement: verdict.agreement }));
    return jsonResponse(response, usable.length ? 200 : 502, {
      id: `grz-council-${issuedSession}`,
      object: 'chat.completion',
      model: winnerAlias,
      choices: [{ index: 0, message: { role: 'assistant', content: winnerText }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      council: {
        judge: spec.judge,
        variants: candidates.map((c) => ({ alias: c.alias, ok: c.ok, ms: c.ms, status: c.status })),
        winner: winnerAlias,
        outlier: verdict.outlier,
        agreement: verdict.agreement,
        ...(spec.judge === 'field-vote' ? { votes: verdict.votes, abstained: verdict.abstained } : {}),
      },
    }, headers);
  }

  async judgeCouncil(judge, userText, usable, request) {
    if (!usable.length) return { judge, winner: null, outlier: null, agreement: 0 };
    if (judge === 'field-vote') return fieldVote(usable);
    if (judge === 'similarity') {
      const embedAgent = this.registry.get('semantic-embedding-agent');
      const vectors = [];
      if (embedAgent && this.registry.status('semantic-embedding-agent').state !== 'unavailable') {
        try {
          await this.processes.ensure(embedAgent, { signal: request.abortSignal });
          for (const c of usable) {
            const r = await this.fetchImpl(`http://127.0.0.1:${embedAgent.port}/v1/embeddings`, {
              method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'semantic-embedding-agent', input: c.content.slice(0, 4000) }),
              signal: deadlineSignal(request.abortSignal, 20_000),
            });
            const emb = JSON.parse(await readCappedText(r, 4 * 1024 * 1024))?.data?.[0]?.embedding;
            if (Array.isArray(emb)) vectors.push({ alias: c.alias, embedding: emb });
          }
        } catch { /* fall through */ }
      }
      return similarityVote(usable, vectors);
    }
    // judge-model: ask the nexus (or a configured judge alias) to pick
    const judgeAlias = this.manifest.gateway.council_judge_alias ?? NEXUS_ALIAS;
    const jAgent = this.registry.get(judgeAlias);
    try {
      await this.processes.ensure(jAgent, { signal: request.abortSignal });
      const res = await this.fetchImpl(`http://127.0.0.1:${jAgent.port}/v1/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: judgePrompt(userText, usable) }], max_tokens: 8, stream: false }),
        signal: deadlineSignal(request.abortSignal, 25_000),
      });
      const reply = JSON.parse(await readCappedText(res, 1024 * 1024))?.choices?.[0]?.message?.content ?? '';
      return resolveJudgeChoice(reply, usable);
    } catch {
      return { judge: 'judge-model', winner: usable[0].alias, outlier: null, agreement: null };
    }
  }

  recordCouncil({ task, spec, candidates, verdict }) {
    if (!this.councilDir) return;
    try {
      mkdirSync(this.councilDir, { recursive: true });
      const row = {
        ts: Date.now(), task, judge: spec.judge, aliases: spec.aliases,
        winner: verdict.winner, outlier: verdict.outlier, agreement: verdict.agreement,
        results: candidates.map((c) => ({
          alias: c.alias, ok: c.ok, ms: c.ms,
          verdict: c.alias === verdict.winner ? 'winner' : c.alias === verdict.outlier ? 'outlier' : (c.ok ? 'agreed' : 'failed'),
        })),
      };
      appendFileSync(path.join(this.councilDir, 'scores.jsonl'), JSON.stringify(row) + '\n');
    } catch { /* best effort */ }
  }

  routeHeaders(issuedSession, routed, cors, extra = {}) {
    return {
      'x-session-id': headerSafe(issuedSession),
      'x-green-roomz-requested-alias': headerSafe(String(routed.requestedAlias ?? '')),
      'x-green-roomz-effective-alias': headerSafe(routed.effectiveAlias ?? ''),
      'x-green-roomz-route-reason': headerSafe(routed.reason ?? ''),
      'x-green-roomz-hops': headerSafe(extra.hops ?? ''),
      'x-green-roomz-nexus': NEXUS_ALIAS,
      'x-green-roomz-agency': AGENCY_ROLE,
      ...cors,
    };
  }

  async handleInference(request, response, body, identity, cors, pathname) {
    const sessionId = request.headers['x-session-id'] || body.session_id;
    const session = this.sessions.get(sessionId, identity);
    const planOnly = wantsRoutePlan(body, pathname ?? request.url?.split('?')[0]);
    if (planOnly) {
      return this.handleRoutePlan(request, response, body, identity, session, cors);
    }

    if (!isChatPath(pathname ?? request.url?.split('?')[0])) {
      return this.handleDirectAlias(request, response, body, identity, session, cors);
    }

    if (body.model === MONITOR_ALIAS) {
      return this.handleMonitorSnapshot(request, response, body, identity, session, cors);
    }

    const councilSpec = parseCouncilRequest(body, this.registry);
    if (councilSpec) {
      return this.handleCouncil(request, response, body, identity, session, cors, pathname, councilSpec);
    }

    return this.handleChatTurn(request, response, body, identity, session, cors, pathname);
  }

  /**
   * Persist any /faith /fear /confidence /yolo /rebuke setting carried on this turn
   * to the session, then report the faith/fear levels the nexus consult should run at.
   * hardRuleRoute already parsed (and would have thrown on) a bad slash command.
   */
  applyTurnSettings(issuedSession, identity, body) {
    let slash = null;
    try { slash = parseSlashCommand(body); } catch { slash = null; }
    if (slash?.setting) {
      const patch = {};
      if (slash.setting === 'faith') patch.faith = slash.faith;
      else if (slash.setting === 'fear') patch.fear = slash.fear;
      else if (slash.setting === 'confidence') patch.confidenceMood = slash.confidenceMood;
      else if (slash.setting === YOLO_TOKEN) patch.yolo = slash.yolo;
      if (Object.keys(patch).length) this.sessions.patch(issuedSession, patch);
    }
    if (slash?.op === REBUKE_OP) {
      this.sessions.patch(issuedSession, { op: REBUKE_OP, rebuke: slash.rest || null });
    }
    const entry = this.sessions.get(issuedSession, identity);
    return { faithLevel: entry?.faith ?? DEFAULT_FAITH, fearLevel: entry?.fear ?? DEFAULT_FEAR };
  }

  async handleRoutePlan(request, response, body, identity, session, cors) {
    const hard = hardRuleRoute(body, this.registry);
    if (hard.effectiveAlias) {
      const routed = {
        requestedAlias: body.model ?? null,
        effectiveAlias: hard.effectiveAlias,
        reason: hard.reason,
        modality: hard.modality,
      };
      const issuedSession = session?.id ?? this.sessions.create({
        identity,
        agentAlias: routed.effectiveAlias,
        modality: routed.modality,
      });
      return jsonResponse(response, 200, {
        id: `grz-route-${issuedSession}`,
        object: 'chat.completion',
        model: NEXUS_ALIAS,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ route: hard.effectiveAlias, reason_code: hard.reason }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }, this.routeHeaders(issuedSession, routed, cors, { hops: '' }));
    }
    const consultBody = stripSlashCommand(body);
    const settings = session?.id
      ? this.applyTurnSettings(session.id, identity, body)
      : { faithLevel: DEFAULT_FAITH, fearLevel: DEFAULT_FEAR };
    const nexusLive = this.registry.status(NEXUS_ALIAS).state !== 'unavailable';
    let plan = planRoute({ messages: [{ role: 'user', content: latestUserMessageText(consultBody) }] });
    if (nexusLive) {
      try {
        const picked = await consultNexus({
          processes: this.processes,
          registry: this.registry,
          fetchImpl: this.fetchImpl,
          body: consultBody,
          visited: new Set(),
          notes: [],
          signal: request.abortSignal,
          ...settings,
        });
        if (picked?.route) {
          plan = {
            route: picked.route,
            confidence: picked.confidence,
            reason_code: picked.reason,
            required_modalities: ['text'],
            allowed_tool_arguments: {},
          };
        }
      } catch {}
    }
    const alias = plan.route
      ?? (isRoutableAlias(this.registry, FALLBACK_ALIAS) ? FALLBACK_ALIAS : NEXUS_ALIAS);
    plan = { ...plan, route: alias };
    const routed = {
      requestedAlias: body.model ?? null,
      effectiveAlias: alias,
      reason: plan.reason_code,
      modality: detectModalities(body),
    };
    const issuedSession = session?.id ?? this.sessions.create({
      identity,
      agentAlias: routed.effectiveAlias ?? NEXUS_ALIAS,
      modality: routed.modality,
    });
    return jsonResponse(response, 200, {
      id: `grz-route-${issuedSession}`,
      object: 'chat.completion',
      model: NEXUS_ALIAS,
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(plan) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }, this.routeHeaders(issuedSession, routed, cors, { hops: '' }));
  }

  async handleDirectAlias(request, response, body, identity, session, cors) {
    const alias = body.model;
    if (!alias || !this.registry.agents.has(alias)) throw new ValidationError(`Unknown agent alias: ${alias}`);
    const availability = this.registry.status(alias);
    if (availability.state === 'unavailable') throw new UnavailableError(`${alias} is unavailable`, availability.missing);
    const agent = this.registry.get(alias);
    const issuedSession = session?.id ?? this.sessions.create({
      identity,
      agentAlias: alias,
      modality: detectModalities(body),
    });
    if (session?.id) this.sessions.setAgentAlias(issuedSession, alias);
    const headers = this.routeHeaders(issuedSession, { requestedAlias: body.model, effectiveAlias: alias, reason: 'requested_alias' }, cors, { hops: alias });
    for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
    const release = await this.policy.acquire(request.abortSignal);
    try {
      await this.processes.ensure(agent, { signal: request.abortSignal });
      const payload = prepareInferenceBody(body, agent);
      const path = String(request.url.split('?')[0]).replace(/\/route$/, '') || '/v1/chat/completions';
      await proxyJson({
        request,
        response,
        body: payload,
        target: `http://127.0.0.1:${agent.port}${path}`,
        config: this.manifest.gateway,
        signal: request.abortSignal,
        fetchImpl: this.fetchImpl,
      });
    } finally {
      release();
    }
  }

  async handleChatTurn(request, response, body, identity, session, cors, pathname) {
    const visited = new Set();
    const hops = [];
    const notes = [];
    const hard = hardRuleRoute(body, this.registry);
    const issuedSession = session?.id ?? this.sessions.create({
      identity,
      agentAlias: hard.effectiveAlias ?? FALLBACK_ALIAS,
      modality: hard.modality,
    });
    const turnSettings = this.applyTurnSettings(issuedSession, identity, body);

    const hopHeaders = (alias, reason) => this.routeHeaders(
      issuedSession,
      { requestedAlias: body.model ?? null, effectiveAlias: alias ?? '', reason: reason ?? 'nexus' },
      cors,
      { hops: hops.join(',') },
    );

    const release = await this.policy.acquire(request.abortSignal);
    try {
      if (hard.effectiveAlias === NEXUS_ALIAS) {
        return await this.completeOnResident(request, response, body, issuedSession, cors, hops, hard.reason ?? 'lock_alias');
      }
      let peekedSpecialist = false;
      while (hops.length < MAX_SPECIALIST_HOPS) {
        let alias;
        let reason;
        if (hops.length === 0 && hard.effectiveAlias) {
          alias = hard.effectiveAlias;
          reason = hard.reason;
          if (alias === MONITOR_ALIAS) {
            return this.handleMonitorSnapshot(request, response, body, identity, session, cors);
          }
          if (!isRoutableAlias(this.registry, alias) || !aliasCanAdmit(this.registry, alias, this.processes)) {
            visited.add(alias);
            hops.push(alias);
            notes.push(stripControls(`${alias} unavailable (impractical or missing)`));
            this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: hard.reason } });
            continue;
          }
        } else {
          const picked = await consultNexus({
            processes: this.processes,
            registry: this.registry,
            fetchImpl: this.fetchImpl,
            body: stripSlashCommand(body),
            visited,
            notes,
            signal: request.abortSignal,
            ...turnSettings,
          });
          alias = picked.route;
          reason = picked.reason ?? 'nexus';
        }

        if (!alias || visited.has(alias) || alias === NEXUS_ALIAS) break;
        if (alias === 'speech-synthesis-agent') {
          const slashOrLock = Boolean(hard.effectiveAlias === alias);
          if (!slashOrLock) {   // never auto-route into TTS; only /tts or lock_alias
            visited.add(alias); hops.push(alias);
            notes.push(stripControls('speech-synthesis-agent skipped (not slash-selected)'));
            continue;
          }
          hops.push(alias);
          return await this.completeSpeech(request, response, body, issuedSession, cors, hops);
        }
        const slashOrLock = Boolean(hard.effectiveAlias && hard.effectiveAlias === alias);
        const native = NATIVE_CHAT[alias];
        if (native) {
          if (!slashOrLock) {
            visited.add(alias);
            hops.push(alias);
            notes.push(stripControls(`${alias} skipped (not slash-selected)`));
            this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: 'native_not_selected', hops: hops.slice() } });
            continue;
          }
          hops.push(alias);
          return await this.completeNativeChat(request, response, body, issuedSession, cors, hops, alias, native, reason);
        }
        if (!isRoutableAlias(this.registry, alias) || !aliasCanAdmit(this.registry, alias, this.processes)) {
          visited.add(alias);
          hops.push(alias);
          notes.push(stripControls(`${alias} unavailable (impractical or missing)`));
          this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: 'unavailable', hops: hops.slice() } });
          continue;
        }

        // Cold-start policy for a nexus-picked specialist. An explicit slash/lock
        // may start anything. Auto-routing may start the general-text fallback
        // (so a plain question gets a real answer instead of the router's echo),
        // but still won't spontaneously mmap a 4B/7B code/vision model - those
        // stay opt-in via /code, /vision, etc. Idle eviction bounds the warm set.
        const alreadyReady = this.registry.status(alias).state === 'ready';
        const mayColdStart = slashOrLock || alias === FALLBACK_ALIAS;
        if (!mayColdStart && !alreadyReady && alias !== NEXUS_ALIAS) {
          visited.add(alias);
          hops.push(alias);
          notes.push(stripControls(`${alias} cold; falling back`));
          this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: 'cold_skipped', hops: hops.slice() } });
          continue;
        }

        visited.add(alias);
        hops.push(alias);
        const agent = this.registry.get(alias);
        let record;
        try {
          record = await this.processes.ensure(agent, { signal: request.abortSignal });
        } catch (startError) {
          if (request.abortSignal?.aborted) throw startError;
          notes.push(stripControls(`${alias} failed to start: ${startError?.message ?? startError}`));
          this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: 'start_failed', hops: hops.slice() } });
          continue;   // let the loop end -> media guard / text fallback below
        }
        if (record?.logical) {
          this.observeHop('success', alias, { ticket: issuedSession, payload: { reason, hops: hops.slice() } });
          this.sessions.setAgentAlias(issuedSession, alias);
          return jsonResponse(response, 200, {
            id: `grz-monitor-${issuedSession}`,
            object: 'chat.completion',
            model: alias,
            choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ alias, runtime: 'logical', mailbox: this.mailbox.recent(), stats: this.mailbox.stats() }) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }, hopHeaders(alias, reason));
        }

        const payload = prepareInferenceBody(body, agent);
        const path = String((pathname ?? request.url.split('?')[0])).replace(/\/route$/, '') || '/v1/chat/completions';
        const target = `http://127.0.0.1:${agent.port}${path}`;
        peekedSpecialist = true;
        const peek = await peekSpecialist({
          fetchImpl: this.fetchImpl,
          request,
          target,
          body: payload,
          signal: request.abortSignal,
        });

        if (peek.degraded === 'peek_timeout' && !peek.handoff) {
          visited.add(alias);
          hops.push(alias);
          notes.push(stripControls(`${alias} did not emit within the peek window`));
          this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: 'peek_timeout' } });
          continue;
        }

        if (peek.handoff) {
          const suggest = peek.handoff.suggest && peek.handoff.suggest !== 'null' ? peek.handoff.suggest : null;
          notes.push(stripControls(peek.handoff.reason ?? 'handoff'));
          if (suggest && suggest !== NEXUS_ALIAS && isRoutableAlias(this.registry, suggest)) notes.push(stripControls(`specialist suggested ${suggest}`));
          continue;
        }

        this.observeHop('success', alias, { ticket: issuedSession, payload: { reason, hops: hops.slice() } });
        if (session?.id) this.sessions.setAgentAlias(issuedSession, alias);
        else this.sessions.setAgentAlias(issuedSession, alias);
        const headers = hopHeaders(alias, reason);
        for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
        return deliverPeek({ peek, request, response, body: payload, headers });
      }

      // A request carrying an image or audio part must NOT fall back to the
      // text model (it will 500 on the media). If its specialist could not be
      // reached, that is a clean 503.
      if (hard.modality?.image || hard.modality?.audio) {
        const want = hard.modality.image ? 'vision-layout-agent' : 'audio-transcription-agent';
        throw new UnavailableError(`${want} could not be started for this ${hard.modality.image ? 'image' : 'audio'} request`,
          (this.registry.status(want).missing ?? []).concat(notes));
      }

      // The loop ended without a real answer (nothing picked, everything cold,
      // a handoff with nowhere to go, a peek timeout, hop budget spent). The
      // general-text model is the safety net for ANY of those - a chat request
      // always gets a chat answer. This is unconditional: a prior peek/handoff
      // does not disqualify the fallback.
      if (!visited.has(FALLBACK_ALIAS) && isRoutableAlias(this.registry, FALLBACK_ALIAS)) {
        try {
          hops.push(FALLBACK_ALIAS);
          const agent = this.registry.get(FALLBACK_ALIAS);
          await this.processes.ensure(agent, { signal: request.abortSignal });
          const payload = prepareInferenceBody(body, agent);
          const path = String((pathname ?? request.url.split('?')[0])).replace(/\/route$/, '') || '/v1/chat/completions';
          this.observeHop('success', FALLBACK_ALIAS, { ticket: issuedSession, payload: { reason: 'text_fallback', hops: hops.slice() } });
          this.sessions.setAgentAlias(issuedSession, FALLBACK_ALIAS);
          const headers = hopHeaders(FALLBACK_ALIAS, 'text_fallback');
          for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
          return await proxyJson({ request, response, body: payload, target: `http://127.0.0.1:${agent.port}${path}`, config: this.manifest.gateway, signal: request.abortSignal, fetchImpl: this.fetchImpl });
        } catch (error) {
          if (response.writableEnded || response.headersSent) throw error;
          notes.push(stripControls(`text fallback failed: ${error?.message ?? error}`));
        }
      }
      // General-text is genuinely gone (no model file). The resident 0.5B is a
      // router, not a chat model - only worth it if it is literally all we have.
      if (this.registry.agents.has(NEXUS_ALIAS) && this.registry.status(NEXUS_ALIAS).state !== 'unavailable') {
        return await this.completeOnResident(request, response, body, issuedSession, cors, hops, 'resident_fallback');
      }
      this.observeHop('route_exhausted', hops[hops.length - 1] ?? '', { ticket: issuedSession, payload: { hops: hops.slice(), visited: [...visited] } });
      return jsonResponse(response, 422, {
        error: {
          type: 'route_exhausted',
          message: 'No specialist accepted this turn',
          visited: [...visited],
        },
      }, hopHeaders(null, 'route_exhausted'));
    } finally {
      release();
    }
  }

  listen(host, port) {
    const address = this.bindAddress(host);
    const listenPort = Number(port ?? this.manifest.gateway.port ?? 8080);
    const server = createServer((req, res) => {
      // A dead client socket must not take the process down mid-write.
      req.on('error', () => {});
      res.on('error', () => {});
      Promise.resolve(this.handle(req, res)).catch((error) => {
        try {
          if (!res.headersSent) {
            jsonResponse(res, 500, { error: { message: redact(String(error?.message ?? error)), type: 'internal_error' } });
          } else if (!res.writableEnded) {
            res.destroy(error instanceof Error ? error : new Error(String(error)));
          }
        } catch { /* socket already gone */ }
      });
    });
    // Malformed HTTP from a client is a 400, never a crash.
    server.on('clientError', (_error, socket) => {
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      else socket.destroy();
    });
    server.headersTimeout = this.manifest.gateway.headers_timeout_ms ?? 30_000;
    server.requestTimeout = this.manifest.gateway.request_timeout_ms ?? 0;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, address, () => resolve(server));
    });
  }
}
