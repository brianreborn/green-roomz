import { spawn } from 'node:child_process';
import os from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { UnavailableError } from './errors.mjs';
import { sleep } from './util.mjs';
import { agentFootprintBytes, headroomBytes, profileAdmitted } from './memory.mjs';

const MAX_LOG_CHARS = 64 * 1024;

// How to tell each backend has finished loading its model.
const okStatus = (r) => r.ok ?? (r.status >= 200 && r.status < 300);
const anyAnswer = (r) => r.ok ?? (r.status != null && r.status < 500);
const READY_PROBE = {
  'llama-server': { path: '/health', ready: okStatus },
  'whisper-server': { path: '/', ready: anyAnswer },
  'stable-diffusion': { path: '/', ready: anyAnswer },
};

export function vulkanAllThreadCount(logicalCpus = os.cpus().length) {
  const n = Number(logicalCpus);
  const logical = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 8;
  // Ryzen 5 7520U APU: 8 logical CPUs, AMD Radeon ~8058 MiB shared Vulkan.
  // vulkan-all uses logical-2 (6 on this host): those two cores are reserved for the
  // resident CPU nexus (--threads 2) so it can run concurrently with a GPU specialist.
  // 4/8 shows as 50% in Task Manager; 8/8 starves the GPU. hybrid/cpu-4 keep their own --threads.
  return Math.max(1, logical - 2);
}

export function withVulkanAllThreads(args, logicalCpus = os.cpus().length) {
  const threads = String(vulkanAllThreadCount(logicalCpus));
  const next = [...(args ?? [])];
  for (const flag of ['--threads', '--threads-batch']) {
    const index = next.indexOf(flag);
    if (index !== -1 && index + 1 < next.length) next[index + 1] = threads;
  }
  return next;
}


function flagValue(args, flag) {
  const index = (args ?? []).indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export function profileKeepsWeightsOnCpu(profile) {
  const args = profile?.args ?? [];
  return flagValue(args, '--n-gpu-layers') === '0' || flagValue(args, '--device') === 'none';
}

export function artifactSizeBytes(filePath) {
  if (!filePath) return null;
  try {
    if (!existsSync(filePath)) return null;
    const size = statSync(filePath).size;
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

export function cpuResidentWeightBytes(agent) {
  const modelBytes = artifactSizeBytes(agent.model);
  if (modelBytes == null) return null;
  let total = modelBytes;
  const draftWanted = Boolean(agent.draft_enabled && agent.draft_model);
  const draftPresent = draftWanted && existsSync(agent.draft_model);
  if (draftWanted && (draftPresent || !agent.draft_optional)) {
    const draftDevice = flagValue(agent.draft_args ?? [], '--spec-draft-device');
    const draftNgl = flagValue(agent.draft_args ?? [], '--n-gpu-layers-draft');
    if (draftDevice === 'none' || draftNgl === '0') {
      const draftBytes = artifactSizeBytes(agent.draft_model);
      if (draftBytes == null) return agent.draft_optional ? total : null;
      total += draftBytes;
    }
  }
  return total;
}

export function shouldAttachDraft(agent) {
  if (!agent?.draft_enabled || !agent.draft_model) return false;
  if (agent.draft_optional && !existsSync(agent.draft_model)) return false;
  return true;
}

export function isResidentAgent(agent) {
  return Boolean(agent?.resident) || agent?.alias === 'tool-router-agent';
}


export function orderProfiles(agent, profiles, { preferredId, freeMemoryBytes } = {}) {
  const list = [...(profiles ?? [])];
  if (!list.length) return [{ id: 'default', args: [] }];
  const weights = cpuResidentWeightBytes(agent);
  const ramTight = Number.isFinite(freeMemoryBytes) && weights != null && weights > freeMemoryBytes;
  return list.sort((a, b) => {
    if (preferredId) {
      if (a.id === preferredId && b.id !== preferredId) return -1;
      if (b.id === preferredId && a.id !== preferredId) return 1;
    }
    if (ramTight) {
      const aCpu = profileKeepsWeightsOnCpu(a);
      const bCpu = profileKeepsWeightsOnCpu(b);
      if (aCpu !== bCpu) return aCpu ? 1 : -1;
    }
    return 0;
  });
}

export class ProcessManager {
  constructor({ manifest, registry, hostAdapter, fetchImpl = fetch, spawnImpl = spawn, selectedProfiles = new Map() }) {
    this.manifest = manifest;
    this.registry = registry;
    this.hostAdapter = hostAdapter;
    this.fetch = fetchImpl;
    this.spawn = spawnImpl;
    this.selectedProfiles = selectedProfiles;
    this.processes = new Map();
    this.starting = new Map();
    this.idleSweeper = null;
    const g = manifest?.gateway ?? {};
    this.idleEvictMs = g.idle_evict_ms ?? 300_000;
    // Hard ceiling on warm specialists. Default: no artificial cap - free memory
    // is the real gate (see evictForNewSpecialist). A tight box sets this low.
    this.maxWarmSpecialists = g.max_warm_specialists
      ?? Math.max(1, (manifest?.agents ?? []).filter((a) => a.runtime === 'llama_server' && !isResidentAgent(a)).length);
  }

  get(alias) {
    return this.processes.get(alias);
  }

  touch(alias) {
    const record = this.processes.get(alias);
    if (record) record.lastUsedAt = Date.now();
  }

  async ensure(agent, { signal } = {}) {
    if (agent.runtime === 'logical') return { logical: true, agent };
    const current = this.processes.get(agent.alias);
    if (current?.state === 'ready' && current.child.exitCode === null) {
      current.lastUsedAt = Date.now();
      return current;
    }
    // Resident CPU nexus (tool-router-agent) stays loaded for the life of serve.
    // Starting a specialist must never stop or unload it — two llama-server
    // processes at once is required (nexus :8187 CPU + specialist vulkan).
    if (this.starting.has(agent.alias)) return this.starting.get(agent.alias);
    const promise = Promise.resolve()
      // Make room before starting another specialist on a memory-tight box:
      // evict the LRU warm one now rather than waiting for the idle sweep.
      .then(() => (isResidentAgent(agent) ? null : this.evictForNewSpecialist(agent)))
      .then(() => this.start(agent, { signal }));
    this.starting.set(agent.alias, promise.finally(() => this.starting.delete(agent.alias)));
    return this.starting.get(agent.alias);
  }

  buildLaunch(agent, profile) {
    const runtime = this.manifest.runtimes[agent.runtime];
    const args = [...(runtime.base_args ?? [])];
    if (runtime.kind === 'llama-server') {
      args.push('--port', String(agent.port), '--model', agent.model, '--alias', agent.alias, '--ctx-size', String(profile?.context_size ?? agent.context_size ?? 4096));
      args.push(...(agent.extra_args ?? []), ...(profile?.args ?? []));
      // Only rewrite vulkan-all; hybrid/cpu-4 already set --threads and must not regress.
      if (profile?.id === 'vulkan-all') {
        const patched = withVulkanAllThreads(args, os.cpus().length);
        args.length = 0;
        args.push(...patched);
      }
      if (agent.projector) args.push('--mmproj', agent.projector);
      if (shouldAttachDraft(agent)) {
        args.push(
          '--model-draft', agent.draft_model,
          '--spec-type', agent.draft_type ?? 'draft-simple',
          ...(agent.draft_args ?? []),
        );
      }
      // Default the KV cache to q8_0 (near-lossless, ~half the KV bytes) for
      // autoregressive text/vision agents. Embedding and reranker backends run
      // a single forward pass with no generative KV cache; a quantized cache
      // type makes them fail to decode, so leave those alone. Opt a profile/agent
      // out with kv_cache: "f16".
      const caps = new Set(agent.native_capabilities ?? []);
      const usesKvCache = !caps.has('embedding') && !caps.has('reranking');
      const kv = profile?.kv_cache ?? agent.kv_cache ?? 'q8_0';
      if (usesKvCache && kv !== 'f16' && !args.includes('--cache-type-k')) args.push('--cache-type-k', kv);
      if (usesKvCache && kv !== 'f16' && !args.includes('--cache-type-v')) args.push('--cache-type-v', kv);
    } else if (runtime.kind === 'whisper-server') {
      args.push('--port', String(agent.port), '--model', agent.model, ...(profile?.args ?? []));
    } else if (runtime.kind === 'stable-diffusion') {
      args.push('--listen-port', String(agent.port), '--model', agent.model, ...(profile?.args ?? []));
    } else if (runtime.kind === 'piper') {
      throw new UnavailableError('Piper currently runs as a one-shot synthesizer; a persistent server adapter is not provisioned yet');
    } else {
      throw new UnavailableError(`Runtime ${runtime.kind} has no server adapter yet`);
    }
    const env = { ...process.env, ...(runtime.env ?? {}) };
    for (let i = 0; i < args.length - 1; i += 1) {
      if (args[i] === '--device' && args[i + 1] === 'none') {
        env.GGML_VULKAN = '0';
        break;
      }
    }
    return { command: runtime.command, args, env, runtime };
  }

  profilesFor(agent) {
    const preferred = this.selectedProfiles.get(agent.alias);
    let freeMemoryBytes;
    try {
      freeMemoryBytes = this.hostAdapter?.sampleResources?.()?.freeMemoryBytes;
    } catch {
      freeMemoryBytes = undefined;
    }
    return orderProfiles(agent, agent.profiles, { preferredId: preferred, freeMemoryBytes });
  }

  async start(agent, { signal } = {}) {
    const availability = this.registry.status(agent.alias);
    if (availability.state === 'unavailable') throw new UnavailableError(`${agent.alias} is unavailable`, availability.missing);
    let lastError;
    let freeMemoryBytes;
    try {
      freeMemoryBytes = this.hostAdapter?.sampleResources?.()?.freeMemoryBytes;
    } catch {
      freeMemoryBytes = undefined;
    }
    const includeDraft = shouldAttachDraft(agent);
    for (const profile of this.profilesFor(agent)) {
      const admission = profileAdmitted(agent, profile, { freeMemoryBytes, includeDraft });
      if (!admission.ok) {
        lastError = new UnavailableError(
          `${agent.alias} profile ${profile.id} skipped: ${admission.reason} (estimate ${admission.estimateBytes} + headroom ${admission.headroomBytes} > free ${freeMemoryBytes})`,
        );
        continue;
      }
      try {
        return await this.startProfile(agent, profile, { signal });
      } catch (error) {
        lastError = error;
        if (signal?.aborted || /abort/i.test(String(error.message))) {
          this.registry.setStatus(agent.alias, 'cold', { lastError: error.message });
          throw error;
        }
      }
    }
    this.registry.setStatus(agent.alias, 'unavailable', { lastError: lastError?.message });
    throw lastError ?? new UnavailableError(`Unable to start ${agent.alias}`);
  }

  async startProfile(agent, profile, { signal } = {}) {
    const launch = this.buildLaunch(agent, profile);
    const child = this.spawn(launch.command, launch.args, {
      env: launch.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    const record = {
      alias: agent.alias,
      child,
      pid: child.pid,
      command: launch.command,
      args: Object.freeze([...launch.args]),
      profileId: profile.id,
      createdAt: Date.now(),
      state: 'starting',
      logs: '',
      owned: true,
      resident: isResidentAgent(agent),
    };
    this.processes.set(agent.alias, record);
    this.registry.setStatus(agent.alias, 'starting', { profileId: profile.id });
    this.hostAdapter?.applyPriority(child);
    const append = (chunk) => { record.logs = (record.logs + chunk.toString()).slice(-MAX_LOG_CHARS); };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.once('exit', (code, signalName) => {
      record.state = 'exited';
      record.exitCode = code;
      record.exitSignal = signalName;
      if (this.processes.get(agent.alias) === record) this.registry.setStatus(agent.alias, 'cold', { lastExitCode: code });
    });
    child.once('error', append);
    try {
      await this.waitForReady(agent, record, signal);
      record.state = 'ready';
      this.registry.setStatus(agent.alias, 'ready', { pid: child.pid, profileId: profile.id });
      return record;
    } catch (error) {
      await this.stopRecord(record);
      const detail = record.logs.trim().slice(-2000);
      throw new UnavailableError(`Failed to start ${agent.alias} with ${profile.id}: ${error.message}${detail ? `; ${detail}` : ''}`);
    }
  }

  async waitForReady(agent, record, signal) {
    const timeoutMs = this.manifest.gateway.cold_start_timeout_ms;
    const deadline = Date.now() + timeoutMs;
    const runtimeKind = this.manifest.runtimes[agent.runtime]?.kind;
    // llama-server returns /health 503 while the model loads, 200 when ready -> need .ok.
    // whisper-server / sd-server have no /health (it 404s); they only start listening
    // once the model is loaded, so any HTTP answer on their root path means ready.
    const probe = READY_PROBE[runtimeKind] ?? READY_PROBE['llama-server'];
    while (Date.now() < deadline) {
      if (record.child.exitCode !== null) throw new Error(`process exited with ${record.child.exitCode}`);
      try {
        const response = await this.fetch(`http://127.0.0.1:${agent.port}${probe.path}`, {
          signal: AbortSignal.timeout(1500),
          headers: { connection: 'close' },
        });
        try {
          if (typeof response.arrayBuffer === 'function') await response.arrayBuffer();
          else if (response.body?.cancel) await response.body.cancel();
        } catch {}
        if (probe.ready(response)) return;
      } catch {}
      await sleep(200, signal);
    }
    throw new Error(`health deadline exceeded after ${timeoutMs} ms`);
  }

  async stop(alias) {
    const record = this.processes.get(alias);
    if (!record) return false;
    await this.stopRecord(record);
    this.processes.delete(alias);
    this.registry.setStatus(alias, 'cold');
    return true;
  }

  async stopRecord(record) {
    if (!record.owned || record.child.exitCode !== null) return;
    record.state = 'stopping';
    const exited = new Promise((resolve) => record.child.once('exit', resolve));
    if (record.child.exitCode === null) record.child.kill('SIGTERM');
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        if (record.child.exitCode === null) record.child.kill('SIGKILL');
        resolve();
      }, 3000);
    });
    await Promise.race([exited, timeout]);
    clearTimeout(timer);
  }

  async stopAll() {
    this.stopIdleSweeper();
    await Promise.all([...this.processes.keys()].map((alias) => this.stop(alias)));
  }

  /**
   * Stop non-resident specialist backends that have been idle past idleEvictMs,
   * always keeping the maxWarmSpecialists most-recently-used. The resident nexus
   * and anything currently starting are never touched. Keeps a 16 GB box from
   * drowning in mmap'd model files.
   */
  /**
   * Make room for `incoming` before it cold-starts. Criteria, in order:
   *   1. hard ceiling  - never keep more than maxWarmSpecialists warm.
   *   2. memory        - evict LRU warm models until the incoming model's
   *                      estimated footprint + headroom fits in free RAM.
   * On a high-memory box under the ceiling, this evicts nothing. When free RAM
   * can't be sampled, it falls back to the ceiling alone. Evicted ports are
   * waited on - a big model must be fully released before the next allocates.
   */
  async evictForNewSpecialist(incoming) {
    const incomingAlias = typeof incoming === 'string' ? incoming : incoming?.alias;
    const incomingAgent = typeof incoming === 'string'
      ? this.manifest.agents.find((a) => a.alias === incoming)
      : incoming;
    const warm = [...this.processes.values()].filter((r) =>
      r.owned && !r.resident && r.alias !== incomingAlias
      && (r.state === 'ready' || r.state === 'starting') && r.child.exitCode === null);
    if (!warm.length) return [];
    warm.sort((a, b) => (a.lastUsedAt ?? a.createdAt ?? 0) - (b.lastUsedAt ?? b.createdAt ?? 0)); // LRU first

    let free;
    try { free = this.hostAdapter?.sampleResources?.()?.freeMemoryBytes; } catch { free = undefined; }
    const need = agentFootprintBytes(incomingAgent) ?? 0;
    const headroom = headroomBytes();

    const drop = [];
    let remaining = [...warm];
    const overCeiling = () => remaining.length + 1 > Math.max(1, this.maxWarmSpecialists);
    const overMemory = () => Number.isFinite(free) && need > 0 && (free - need) < headroom;
    while (remaining.length && (overCeiling() || overMemory())) {
      const victim = remaining.shift();
      drop.push(victim);
      const est = agentFootprintBytes(this.manifest.agents.find((a) => a.alias === victim.alias)) ?? 0;
      if (Number.isFinite(free)) free += est; // assume the OS reclaims it
    }
    if (!drop.length) return [];

    const ports = drop.map((r) => this.manifest.agents.find((a) => a.alias === r.alias)?.port).filter(Boolean);
    await Promise.all(drop.map((r) => this.stop(r.alias)));
    await this.waitForPortsFree(ports);
    return drop.map((r) => r.alias);
  }

  /** Poll until nothing answers on these loopback ports (evicted model fully released). */
  async waitForPortsFree(ports, { timeoutMs = 8000 } = {}) {
    if (!ports?.length) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const alive = await Promise.all(ports.map(async (p) => {
        try { await this.fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(400), headers: { connection: 'close' } }); return true; }
        catch { return false; }
      }));
      if (!alive.some(Boolean)) return;
      await sleep(150);
    }
  }

  async sweepIdle(now = Date.now()) {
    const evictable = [...this.processes.values()].filter((r) =>
      r.owned && !r.resident && r.state === 'ready' && r.child.exitCode === null && !this.starting.has(r.alias));
    evictable.sort((a, b) => (b.lastUsedAt ?? b.createdAt ?? 0) - (a.lastUsedAt ?? a.createdAt ?? 0));
    const overCap = new Set(evictable.slice(Math.max(0, this.maxWarmSpecialists)).map((r) => r.alias));
    const doomed = evictable.filter((r) => {
      const idleFor = now - (r.lastUsedAt ?? r.createdAt ?? now);
      return overCap.has(r.alias) || (this.idleEvictMs > 0 && idleFor > this.idleEvictMs);
    });
    await Promise.all(doomed.map((r) => this.stop(r.alias)));
    return doomed.map((r) => r.alias);
  }

  startIdleSweeper(intervalMs = 30_000) {
    if (this.idleSweeper || this.idleEvictMs <= 0) return;
    this.idleSweeper = setInterval(() => { this.sweepIdle().catch(() => {}); }, intervalMs);
    this.idleSweeper.unref?.();
  }

  stopIdleSweeper() {
    if (this.idleSweeper) { clearInterval(this.idleSweeper); this.idleSweeper = null; }
  }
}
