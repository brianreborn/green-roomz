import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { FALLBACK_ALIAS, MAX_SPECIALIST_HOPS, MONITOR_ALIAS, NEXUS_ALIAS } from './constants.mjs';
import { Mailbox } from './mailbox.mjs';
import { CAP, MonitorIpc } from './monitor/ipc.mjs';
import { createLogger } from './monitor/logger.mjs';
import { GreenRoomzError, UnavailableError, ValidationError } from './errors.mjs';
import { deliverPeek, peekSpecialist } from './handoff.mjs';
import { consultNexus } from './nexus.mjs';
import { planRoute } from './logical-router.mjs';
import { proxyJson } from './proxy.mjs';
import { aliasCanAdmit, audioDataFromBody, detectModalities, hardRuleRoute, isRoutableAlias, latestUserMessageText, NATIVE_CHAT, stripSlashCommand } from './routing.mjs';
import { headerSafe, jsonResponse, redact, secureEquals, stripControls } from './util.mjs';

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

export function injectSystemPolicy(body, agent) {
  const payload = { ...body };
  const policyPath = agent?.system_policy;
  if (!policyPath || !existsSync(policyPath)) return payload;
  const policy = readFileSync(policyPath, 'utf8');
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

function wrapNativeAsChat(alias, nativeJson) {
  return {
    id: `grz-native-${alias}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: alias,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: typeof nativeJson === 'string' ? nativeJson : JSON.stringify(nativeJson) },
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
  return body;
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
  }

  bindAddress(host) {
    const requested = host ?? this.manifest.gateway.host ?? '127.0.0.1';
    const loopback = requested === '127.0.0.1' || requested === 'localhost' || requested === '::1';
    if (!loopback) {
      if (!this.apiKey || process.env.GREEN_ROOMZ_ALLOW_PUBLIC !== '1') {
        throw new ValidationError('Public/non-loopback binding requires GREEN_ROOMZ_API_KEY and GREEN_ROOMZ_ALLOW_PUBLIC=1');
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
          native_capabilities_are_truthful: true,
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
      const retryAfter = error instanceof UnavailableError ? { 'retry-after': '2' } : {};
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
    const target = agent.backend_url ? `${agent.backend_url}${path}` : `http://127.0.0.1:${agent.port}${path}`;
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
    const target = agent.backend_url ? `${agent.backend_url}${native.path}` : `http://127.0.0.1:${agent.port}${native.path}`;
    const upstream = await this.fetchImpl(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' },
      body: JSON.stringify(payload),
      signal: request.abortSignal,
    });
    const raw = typeof upstream.text === 'function'
      ? await upstream.text()
      : JSON.stringify(await upstream.json());
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
    this.observeHop('success', alias, { ticket: issuedSession, payload: { reason, hops: hops.slice() } });
    this.sessions.setAgentAlias(issuedSession, alias);
    const wrapped = wrapNativeAsChat(alias, parsed);
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

  routeHeaders(issuedSession, routed, cors, extra = {}) {
    return {
      'x-session-id': headerSafe(issuedSession),
      'x-green-roomz-requested-alias': headerSafe(String(routed.requestedAlias ?? '')),
      'x-green-roomz-effective-alias': headerSafe(routed.effectiveAlias ?? ''),
      'x-green-roomz-route-reason': headerSafe(routed.reason ?? ''),
      'x-green-roomz-hops': headerSafe(extra.hops ?? ''),
      'x-green-roomz-nexus': NEXUS_ALIAS,
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

    return this.handleChatTurn(request, response, body, identity, session, cors, pathname);
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
      const target = agent.backend_url ? `${agent.backend_url}${path}` : `http://127.0.0.1:${agent.port}${path}`;
      await proxyJson({
        request,
        response,
        body: payload,
        target,
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
          });
          alias = picked.route;
          reason = picked.reason ?? 'nexus';
        }

        if (!alias || visited.has(alias) || alias === NEXUS_ALIAS) break;
        if (alias === 'speech-synthesis-agent') {
          throw new ValidationError('/tts is not on /v1/chat/completions; speech-synthesis-agent has no persistent server');
        }
        const native = NATIVE_CHAT[alias];
        if (native) {
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

        // Nexus-picked cold specialists: do not mmap a 4B/7B and wedge --parallel 1.
        // Slash/lock (first hop with a hard alias) may still cold-start.
        const alreadyReady = this.registry.status(alias).state === 'ready';
        if (hops.length > 0 && !alreadyReady && alias !== NEXUS_ALIAS) {
          visited.add(alias);
          hops.push(alias);
          notes.push(stripControls(`${alias} cold; using resident`));
          this.observeHop('agent_unavailable', alias, { ticket: issuedSession, payload: { reason: 'cold_skipped', hops: hops.slice() } });
          continue;
        }

        visited.add(alias);
        hops.push(alias);
        const agent = this.registry.get(alias);
        const record = await this.processes.ensure(agent, { signal: request.abortSignal });
        if (record?.logical && alias === MONITOR_ALIAS) {
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
        const target = agent.backend_url ? `${agent.backend_url}${path}` : `http://127.0.0.1:${agent.port}${path}`;
        peekedSpecialist = true;
        const peek = await peekSpecialist({
          fetchImpl: this.fetchImpl,
          request,
          target,
          body: payload,
          signal: request.abortSignal,
        });

        if (peek.handoff) {
          const suggest = peek.handoff.suggest && peek.handoff.suggest !== 'null' ? peek.handoff.suggest : null;
          notes.push(stripControls(peek.handoff.reason ?? 'handoff'));
          if (suggest && suggest !== NEXUS_ALIAS && isRoutableAlias(this.registry, suggest)) notes.push(stripControls(`specialist suggested ${suggest}`));
          continue;
        }

        this.observeHop('success', alias, { ticket: issuedSession, payload: { reason, hops: hops.slice() } });
        this.sessions.setAgentAlias(issuedSession, alias);
        const headers = hopHeaders(alias, reason);
        for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
        return deliverPeek({ peek, request, response, body: payload, headers });
      }

      if (!peekedSpecialist && this.registry.agents.has(NEXUS_ALIAS) && this.registry.status(NEXUS_ALIAS).state !== 'unavailable') {
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
    const listenPort = port != null ? Number(port) : (this.manifest.gateway.port ?? 8080);
    const server = createServer((req, res) => {
      Promise.resolve(this.handle(req, res)).catch((error) => { const cors = corsHeaders(this.manifest, req.headers.origin); if (!res.headersSent) jsonResponse(res, 500, { error: { message: String(error.message), type: 'internal_error' } }, cors); });
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, address, () => resolve(server));
    });
  }
}
