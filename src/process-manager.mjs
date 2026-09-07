import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { UnavailableError } from './errors.mjs';
import { sleep } from './util.mjs';
import { agentFootprintBytes, headroomBytes, profileAdmitted } from './memory.mjs';
import { CpuSetAllocator, defaultThreadCount } from './cpu-set.mjs';

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
  const logical = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
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

export function argsThreadCount(args, fallback = defaultThreadCount()) {
  const index = (args ?? []).indexOf('--threads');
  if (index !== -1 && index + 1 < args.length) {
    const n = Number(args[index + 1]);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return fallback;
}

function stripFlag(args, flag) {
  const next = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag) {
      if (i + 1 < args.length && !String(args[i + 1]).startsWith('-')) i += 1;
      continue;
    }
    next.push(args[i]);
  }
  return next;
}

function hostBindsPublic(args) {
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === '--host' && (args[i + 1] === '0.0.0.0' || args[i + 1] === '::')) return true;
  }
  return false;
}

function liveThreadSum(processes, logicalCpus) {
  let total = 0;
  const fallback = defaultThreadCount(logicalCpus);
  for (const rec of processes.values()) {
    if (!rec || rec.child?.exitCode != null) continue;
    if (!['ready', 'starting', 'suspended', 'stopping'].includes(rec.state)) continue;
    total += argsThreadCount(rec.args ?? [], rec.threads ?? fallback);
  }
  return total;
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
  if (!list.length) return [{ id: 'default', args: ['--device', 'none', '--n-gpu-layers', '0'] }];
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
  constructor({ manifest, registry, hostAdapter, fetchImpl = fetch, spawnImpl = spawn, selectedProfiles = new Map(), logicalCpus = os.cpus().length }) {
    this.manifest = manifest;
    this.registry = registry;
    this.hostAdapter = hostAdapter;
    this.fetch = fetchImpl;
    this.spawn = spawnImpl;
    this.selectedProfiles = selectedProfiles;
    this.processes = new Map();
    this.starting = new Map();
    this.idleSweeper = null;
    const n = Number(logicalCpus);
    this.logicalCpus = Number.isFinite(n) && n > 0 ? Math.trunc(n) : os.cpus().length;
    this.cpuAllocator = new CpuSetAllocator(this.logicalCpus);
    const g = manifest?.gateway ?? {};
    this.idleEvictMs = Number(g.idle_evict_ms);
    if (!Number.isFinite(this.idleEvictMs) || this.idleEvictMs < 0) this.idleEvictMs = 0;
    this.maxWarmSpecialists = Math.max(1, Number(g.max_warm_specialists) || 1);
    this.admitWhenTight = g.admit_when_tight === 'page' ? 'page' : 'refuse';
    // Suspend/resume makes evict->revive cheap: SIGSTOP freezes the model, the
    // OS pages its (now idle) memory out under pressure and back in on SIGCONT -
    // no re-mmap, no KV realloc, no warm-up. POSIX only; on Windows we terminate
    // (a native suspend helper could be wired via suspendImpl later). GPU-pinned
    // VRAM is never freed by suspend, so a Vulkan model still gets terminated
    // when we actually need memory back.
    // PF7: do not SIGSTOP a bound llama-server (LISTEN stays occupied; fights PF1/RF4).
    // Opt-in only via gateway.suspend_evicted === true (still POSIX-only).
    this.canSuspend = g.suspend_evicted === true && process.platform !== 'win32';
    this.suspendImpl = (pid) => process.kill(pid, 'SIGSTOP');
    this.resumeImpl = (pid) => process.kill(pid, 'SIGCONT');
    // Disk-backed KV checkpoints. Off unless a dir is configured.
    this.checkpointDir = g.checkpoint_dir ?? process.env.GREEN_ROOMZ_CHECKPOINT_DIR ?? null;
    this.checkpointKeep = g.checkpoint_keep ?? 3;
    // `(alias) -> hex sha of the agent's current compiled stock prompt`, or null.
    // Injected at serve time. When set, a cold start whose `default` prime
    // snapshot still matches is restored so the model wakes holding its stock
    // prompt instead of an empty context. See `green-roomz prime`.
    this.stockPromptSha = null;
    // PF1/PF4: pack root for cwd + pidfile/children.json under data/
    this.packRoot = g.pack_root
      ?? manifest?._meta?.packageRoot
      ?? process.env.GRZ_ROOT
      ?? (manifest?._meta?.path ? path.resolve(path.dirname(manifest._meta.path), '..') : process.cwd());
    this.dataDir = path.join(this.packRoot, 'data');
  }

  /** Owned child ports for out-of-process stop (PF1). */
  ownedPorts() {
    const ports = [];
    for (const rec of this.processes.values()) {
      if (!rec?.owned) continue;
      const agent = this.manifest.agents.find((a) => a.alias === rec.alias);
      if (agent?.port) ports.push(agent.port);
    }
    const gw = this.manifest.gateway?.port;
    if (gw) ports.push(gw);
    return [...new Set(ports)];
  }

  childrenSnapshot() {
    const rows = [];
    for (const rec of this.processes.values()) {
      if (!rec?.owned || rec.child?.exitCode != null) continue;
      const agent = this.manifest.agents.find((a) => a.alias === rec.alias);
      rows.push({ alias: rec.alias, pid: rec.pid ?? rec.child?.pid, port: agent?.port ?? null, state: rec.state });
    }
    return rows;
  }

  writeChildrenFile() {
    try {
      const file = path.join(this.dataDir, 'children.json');
      const rows = this.childrenSnapshot();
      // Avoid creating empty children.json under cwd during unit tests.
      if (!rows.length && !existsSync(file)) return;
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
    } catch {}
  }

  writeServePid(pid = process.pid) {
    try {
      mkdirSync(this.dataDir, { recursive: true });
      writeFileSync(path.join(this.dataDir, 'serve.pid'), `${pid}\n`);
    } catch {}
  }

  clearServePid() {
    try { unlinkSync(path.join(this.dataDir, 'serve.pid')); } catch {}
    try { unlinkSync(path.join(this.dataDir, 'children.json')); } catch {}
  }

  checkpointPathFor(alias) {
    return path.join(this.checkpointDir, alias.replace(/[^a-z0-9-]/gi, '_'));
  }

  /** Save the live slot KV to a named file. `tag` defaults to a timestamp. */
  async checkpointModel(alias, tag = String(Date.now())) {
    const rec = this.processes.get(alias);
    if (!this.checkpointDir || !rec || rec.child.exitCode !== null) return null;
    if ((rec.refs ?? 0) > 0) return null;
    const agent = this.manifest.agents.find((a) => a.alias === alias);
    const filename = `${tag}.bin`;
    try {
      mkdirSync(this.checkpointPathFor(alias), { recursive: true });
      const res = await this.fetch(`http://127.0.0.1:${agent.port}/slots/0?action=save`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename }), signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      rec.checkpoints = [...(rec.checkpoints ?? []), { tag, filename, at: Date.now() }].slice(-this.checkpointKeep);
      return rec.checkpoints[rec.checkpoints.length - 1];
    } catch { return null; }
  }

  /**
   * A complete, portable "model as it is" = code + data + state:
   *   code    -> the runtime binary (path, so a restore uses the same one)
   *   data    -> the immutable GGUF weights (path, size - not copied; mmap'd)
   *   config  -> the exact argv it was launched with
   *   state   -> the KV-cache checkpoint file (the only non-reconstructible bytes)
   * The descriptor is tiny; the only real payload is the .bin. Restore anywhere
   * the same binary + GGUF exist.
   */
  async snapshotModel(alias, tag = String(Date.now()), extra = {}) {
    const rec = this.processes.get(alias);
    if (!this.checkpointDir || !rec || rec.child.exitCode !== null) return null;
    const agent = this.manifest.agents.find((a) => a.alias === alias);
    const kv = await this.checkpointModel(alias, tag);
    const descriptor = {
      alias,
      tag,
      at: Date.now(),
      code: { command: rec.command, args: [...(rec.args ?? [])] },
      data: { model: agent.model, bytes: artifactSizeBytes(agent.model), projector: agent.projector ?? null },
      profileId: rec.profileId,
      state: kv ? kv.filename : null,
      ...extra,
    };
    const file = path.join(this.checkpointPathFor(alias), `${tag}.snapshot.json`);
    try { writeFileSync(file, JSON.stringify(descriptor, null, 2)); } catch { return null; }
    return { ...descriptor, descriptor: file };
  }

  /**
   * On a cold start: if a `default` prime snapshot exists and still matches
   * (same compiled stock prompt, same model, same runtime binary), restore its
   * KV so the model wakes already holding its stock prompt. Best-effort — any
   * mismatch or failure is silently skipped; prime is regenerated at deploy time.
   */
  async maybeRestoreDefault(agent, record) {
    if (!this.checkpointDir || typeof this.stockPromptSha !== 'function') return false;
    const descPath = path.join(this.checkpointPathFor(agent.alias), 'default.snapshot.json');
    if (!existsSync(descPath)) return false;
    let desc;
    try { desc = JSON.parse(readFileSync(descPath, 'utf8')); } catch { return false; }
    const want = this.stockPromptSha(agent.alias);
    if (!want || desc?.prime?.promptSha !== want) return false;
    if (desc?.data?.model && agent.model && desc.data.model !== agent.model) return false;
    if (desc?.code?.command && record?.command && desc.code.command !== record.command) return false;
    try {
      const ok = await this.restoreModel(agent.alias, desc.state ?? 'default.bin');
      if (ok) {
        record.primed = true;
        record.logs = `${record.logs}\n[prime] restored default KV (${want.slice(0, 12)})\n`.slice(-MAX_LOG_CHARS);
      }
      return ok;
    } catch { return false; }
  }

  /** Restore a saved slot KV into a running model (default: its newest checkpoint). */
  async restoreModel(alias, filename) {
    const rec = this.processes.get(alias);
    if (!this.checkpointDir || !rec || rec.child.exitCode !== null) return false;
    if ((rec.refs ?? 0) > 0) return false;
    const agent = this.manifest.agents.find((a) => a.alias === alias);
    const idle = await this.slotIsIdle(agent.port);
    if (!idle) return false;
    const target = filename ?? rec.checkpoints?.[rec.checkpoints.length - 1]?.filename;
    if (!target) return false;
    try {
      const res = await this.fetch(`http://127.0.0.1:${agent.port}/slots/0?action=restore`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: target }), signal: AbortSignal.timeout(15_000),
      });
      return res.ok;
    } catch { return false; }
  }

  suspendRecord(record) {
    if ((record.refs ?? 0) > 0) return false;
    // PF7: even if canSuspend, a bound listener must not be left SIGSTOP'd for waitForPortsFree.
    // Callers that force suspendImpl still update state; prefer terminate path via canSuspend=false.
    try {
      this.suspendImpl(record.child.pid);
      record.state = 'suspended';
      this.writeChildrenFile();
      return true;
    } catch { return false; }
  }

  pin(alias) {
    const rec = this.processes.get(alias);
    if (!rec) return () => {};
    rec.refs = (rec.refs ?? 0) + 1;
    rec.lastUsedAt = Date.now();
    return () => {
      rec.refs = Math.max(0, (rec.refs ?? 1) - 1);
      rec.lastUsedAt = Date.now();
    };
  }

  /** Empty/default --threads: min(DEFAULT_THREADS, logical CPUs, remaining set). */
  implicitThreadCount() {
    const cap = defaultThreadCount(this.logicalCpus);
    const liveRoom = Math.max(0, this.logicalCpus - liveThreadSum(this.processes, this.logicalCpus));
    const room = Math.min(liveRoom, this.cpuAllocator.remaining());
    return Math.max(1, Math.min(cap, room > 0 ? room : cap));
  }

  /** Council pin() skips eviction; do not fan out more specialists than maxWarm. */
  canParallelCouncil(aliases, requested = true) {
    if (!requested) return false;
    const list = Array.isArray(aliases) ? aliases : [];
    if (list.length <= 1) return false;
    let specialists = 0;
    for (const alias of list) {
      const agent = this.manifest?.agents?.find((a) => a.alias === alias);
      if (!agent || !isResidentAgent(agent)) specialists += 1;
    }
    return specialists <= Math.max(1, this.maxWarmSpecialists);
  }

  async resume(alias) {
    const record = this.processes.get(alias);
    if (!record || record.state !== 'suspended' || record.child.exitCode !== null) return null;
    try { this.resumeImpl(record.child.pid); } catch { return null; }
    record.state = 'starting';
    record.lastUsedAt = Date.now();
    this.registry.setStatus(alias, 'starting', { pid: record.child.pid, profileId: record.profileId, resumed: true });
    const agent = this.manifest.agents.find((a) => a.alias === alias);
    try {
      const response = await this.fetch(`http://127.0.0.1:${agent.port}/health`, {
        signal: AbortSignal.timeout(1500),
        headers: { connection: 'close' },
      });
      const ok = response?.ok ?? (response?.status >= 200 && response?.status < 300);
      if (!ok || record.child.exitCode !== null) throw new Error('resume health failed');
      record.state = 'ready';
      this.registry.setStatus(alias, 'ready', { pid: record.child.pid, profileId: record.profileId, resumed: true });
      return record;
    } catch {
      await this.stopRecord(record);
      if (this.processes.get(alias) === record) this.processes.delete(alias);
      this.registry.setStatus(alias, 'cold');
      return null;
    }
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
    // Cheap revive: a suspended model is already loaded - just SIGCONT it.
    if (current?.state === 'suspended' && current.child.exitCode === null) {
      const resumed = await this.resume(agent.alias);
      if (resumed) return resumed;
    }
    // Resident CPU nexus (tool-router-agent) stays loaded for the life of serve.
    // Starting a specialist must never stop or unload it — two llama-server
    // processes at once is required (nexus :8187 CPU + specialist vulkan).
    if (this.starting.has(agent.alias)) return this.starting.get(agent.alias);

    const bringUp = async () => {
      // Make room before starting another specialist on a memory-tight box:
      // evict the LRU warm one now rather than waiting for the idle sweep.
      if (!isResidentAgent(agent)) await this.evictForNewSpecialist(agent);
      return this.start(agent, { signal });
    };
    // The resident nexus starts immediately (it runs alongside everything).
    // Every other cold start is serialized on one chain - two big models
    // mmapping/allocating at once is the thrash that locked the box up before.
    let promise;
    if (isResidentAgent(agent)) {
      promise = bringUp();
    } else {
      const prev = this.coldStartChain ?? Promise.resolve();
      promise = prev.catch(() => {}).then(bringUp);
      this.coldStartChain = promise.catch(() => {});
    }
    this.starting.set(agent.alias, promise.finally(() => this.starting.delete(agent.alias)));
    return this.starting.get(agent.alias);
  }

  buildLaunch(agent, profile) {
    const runtime = this.manifest.runtimes[agent.runtime];
    const args = [...(runtime.base_args ?? [])];
    if (runtime.kind === 'llama-server') {
      args.push('--port', String(agent.port), '--model', agent.model, '--alias', agent.alias, '--ctx-size', String(profile?.context_size ?? agent.context_size ?? 4096));
      args.push(...(agent.extra_args ?? []), ...(profile?.args ?? []));
      if (hostBindsPublic(args)) {
        throw new UnavailableError(`${agent.alias}: extra_args/profile must not bind 0.0.0.0`, { code: 'public_bind_refused' });
      }
      const noMetrics = stripFlag(args, '--metrics');
      args.length = 0;
      args.push(...noMetrics);
      if (!args.includes('--no-webui')) args.push('--no-webui');
      // Only rewrite vulkan-all; hybrid/cpu-4 already set --threads and must not regress.
      if (profile?.id === 'vulkan-all') {
        const patched = withVulkanAllThreads(args, this.logicalCpus);
        args.length = 0;
        args.push(...patched);
      }
      if (!args.includes('--threads')) {
        const threads = String(this.implicitThreadCount());
        args.push('--threads', threads, '--threads-batch', threads);
      }
      if (agent.projector) args.push('--mmproj', agent.projector);
      // Vision cost controls: cap image tokens (biggest lever for a slow box),
      // and let the projector run on a different device than the LLM.
      if (agent.image_max_tokens && !args.includes('--image-max-tokens')) args.push('--image-max-tokens', String(agent.image_max_tokens));
      if (agent.image_min_tokens && !args.includes('--image-min-tokens')) args.push('--image-min-tokens', String(agent.image_min_tokens));
      if (agent.projector && agent.mmproj_device && !args.includes('--mmproj-device')) args.push('--mmproj-device', agent.mmproj_device);
      if (agent.flash_attn && !args.includes('--flash-attn') && !args.includes('-fa')) args.push('--flash-attn', 'on');
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
      // Evictable specialists skip the empty warm-up run - it makes them report
      // ready ~1 s sooner and the first real request pays the graph-build cost
      // either way. The resident nexus keeps warm-up (it is always hot).
      if (!isResidentAgent(agent) && agent.warmup !== true && !args.includes('--warmup') && !args.includes('--no-warmup')) {
        args.push('--no-warmup');
      }
      // Disk-backed KV: named slot checkpoints (save/restore/rollback, portable,
      // no MMU games) + auto-spill idle slots to the prompt cache. Terminate then
      // becomes "checkpoint and exit", not "lose the conversation".
      if (this.checkpointDir && !args.includes('--slot-save-path')) {
        const slotDir = this.checkpointPathFor(agent.alias);
        mkdirSync(slotDir, { recursive: true }); // llama-server refuses --slot-save-path if it does not exist
        args.push('--slot-save-path', slotDir);
        if (!args.includes('--cache-idle-slots') && !args.includes('--no-cache-idle-slots')) args.push('--cache-idle-slots');
      }
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
    // PF4: prepend loader paths; never clobber host /usr/local/lib (BSD) or DYLD.
    if (process.platform !== 'win32') {
      for (const key of ['LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH']) {
        const fromRuntime = runtime.env?.[key];
        if (!fromRuntime) continue;
        const existing = process.env[key];
        env[key] = existing ? `${fromRuntime}${path.delimiter}${existing}` : fromRuntime;
      }
    } else {
      // Win32: DLL search uses PATH from start.cmd; do not set LD_LIBRARY_PATH.
      delete env.LD_LIBRARY_PATH;
    }
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
    // Hard floor: refuse to spawn into a box that is already about to thrash,
    // even after eviction. A clean 503 beats an OOM/lockup. Configurable.
    const minFree = this.manifest.gateway?.min_free_bytes ?? 384 * 1024 * 1024;
    if (Number.isFinite(freeMemoryBytes) && freeMemoryBytes < minFree) {
      throw new UnavailableError(
        `${agent.alias}: host memory critically low (${Math.round(freeMemoryBytes / 1e6)} MB free < ${Math.round(minFree / 1e6)} MB floor) - retry shortly`,
        { code: 'memory_floor' },
      );
    }
    const includeDraft = shouldAttachDraft(agent);
    let failedThreads = null;
    for (const profile of this.profilesFor(agent)) {
      const admission = profileAdmitted(agent, profile, { freeMemoryBytes, includeDraft, admitWhenTight: this.admitWhenTight });
      if (!admission.ok) {
        lastError = new UnavailableError(
          `${agent.alias} profile ${profile.id} skipped: ${admission.reason} (estimate ${admission.estimateBytes} + headroom ${admission.headroomBytes} > free ${freeMemoryBytes})`,
        );
        continue;
      }
      const probeArgs = [...(this.manifest.runtimes[agent.runtime]?.base_args ?? []), ...(agent.extra_args ?? []), ...(profile?.args ?? [])];
      let wantThreads = argsThreadCount(probeArgs, this.implicitThreadCount());
      if (profile?.id === 'vulkan-all') wantThreads = vulkanAllThreadCount(this.logicalCpus);
      const remaining = Math.max(0, this.logicalCpus - liveThreadSum(this.processes, this.logicalCpus));
      if (wantThreads > remaining) {
        lastError = new UnavailableError(
          `${agent.alias} profile ${profile.id} skipped: cpu_oversubscribed (want ${wantThreads}, remaining ${remaining})`,
          { code: 'cpu_oversubscribed' },
        );
        continue;
      }
      if (failedThreads != null && wantThreads > failedThreads) continue;
      try {
        return await this.startProfile(agent, profile, { signal });
      } catch (error) {
        lastError = error;
        if (signal?.aborted || /abort/i.test(String(error.message))) {
          this.registry.setStatus(agent.alias, 'cold', { lastError: error.message });
          throw error;
        }
        if (/health deadline|timed out|timeout|ENOMEM|OOM/i.test(String(error.message))) {
          failedThreads = wantThreads;
        }
      }
    }
    this.registry.setStatus(agent.alias, 'unavailable', { lastError: lastError?.message });
    throw lastError ?? new UnavailableError(`Unable to start ${agent.alias}`);
  }

  async startProfile(agent, profile, { signal } = {}) {
    const launch = this.buildLaunch(agent, profile);
    const wantThreads = argsThreadCount(launch.args, this.implicitThreadCount());
    const cpus = this.cpuAllocator.allocate(agent.alias, wantThreads);
    if (wantThreads > 0 && cpus.length === 0) {
      throw new UnavailableError(`${agent.alias}: cpu_oversubscribed`, { code: 'cpu_oversubscribed' });
    }
    let child;
    try {
      child = this.spawn(launch.command, launch.args, {
        env: launch.env,
        cwd: this.packRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (error) {
      this.cpuAllocator.release(agent.alias);
      throw error;
    }
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
      refs: 0,
      threads: wantThreads,
      cpus,
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
      this.cpuAllocator.release(agent.alias);
      if (this.processes.get(agent.alias) === record) {
        this.processes.delete(agent.alias);
        this.registry.setStatus(agent.alias, 'cold', { lastExitCode: code });
      }
    });
    child.once('error', append);
    try {
      await this.waitForReady(agent, record, signal);
      record.state = 'ready';
      this.registry.setStatus(agent.alias, 'ready', { pid: child.pid, profileId: profile.id });
      this.writeChildrenFile();
      await this.maybeRestoreDefault(agent, record).catch(() => {});
      return record;
    } catch (error) {
      await this.stopRecord(record);
      this.cpuAllocator.release(agent.alias);
      if (this.processes.get(agent.alias) === record) this.processes.delete(agent.alias);
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

  async stop(alias, { checkpoint = true } = {}) {
    const record = this.processes.get(alias);
    if (!record) return false;
    // Terminate is "checkpoint the KV, then exit" - not "lose the conversation".
    if (checkpoint && this.checkpointDir && !record.resident && record.state === 'ready' && record.child.exitCode === null) {
      await this.checkpointModel(alias, 'on-stop');
    }
    await this.stopRecord(record);
    this.processes.delete(alias);
    this.registry.setStatus(alias, 'cold');
    this.writeChildrenFile();
    return true;
  }

  async stopRecord(record) {
    if (!record.owned || record.child.exitCode !== null) return;
    this.cpuAllocator.release(record.alias);
    // A SIGSTOP'd process won't act on SIGTERM until it runs again.
    if (record.state === 'suspended') { try { this.resumeImpl(record.child.pid); } catch {} }
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
    this.writeChildrenFile();
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
  isPinned(alias) {
    return Boolean(this.manifest.agents.find((a) => a.alias === alias)?.pinned);
  }

  async evictForNewSpecialist(incoming) {
    const incomingAlias = typeof incoming === 'string' ? incoming : incoming?.alias;
    const incomingAgent = typeof incoming === 'string'
      ? this.manifest.agents.find((a) => a.alias === incoming)
      : incoming;
    const live = [...this.processes.values()].filter((r) =>
      r.owned && !r.resident && r.alias !== incomingAlias && !this.isPinned(r.alias)
      && (r.refs ?? 0) === 0
      && ['ready', 'starting', 'suspended'].includes(r.state) && r.child.exitCode === null);
    if (!live.length) return { suspended: [], terminated: [] };
    live.sort((a, b) => (a.lastUsedAt ?? a.createdAt ?? 0) - (b.lastUsedAt ?? b.createdAt ?? 0)); // LRU first

    let free;
    try { free = this.hostAdapter?.sampleResources?.()?.freeMemoryBytes; } catch { free = undefined; }
    const need = agentFootprintBytes(incomingAgent) ?? 0;
    const headroom = headroomBytes();
    const footprint = (alias) => agentFootprintBytes(this.manifest.agents.find((a) => a.alias === alias)) ?? 0;
    const cpuBacked = (rec) => {
      const agent = this.manifest.agents.find((a) => a.alias === rec.alias);
      const prof = (agent?.profiles ?? []).find((p) => p.id === rec.profileId);
      return profileKeepsWeightsOnCpu(prof);
    };

    const handled = new Set();   // aliases dealt with this pass
    const activeLeft = () => live.filter((r) => r.state !== 'suspended' && !handled.has(r.alias)).length + 1; // +1 = incoming
    const overCeiling = () => activeLeft() > Math.max(1, this.maxWarmSpecialists);
    const overMemory = () => Number.isFinite(free) && need > 0 && (free - need) < headroom;

    const suspended = [];
    const terminated = [];
    for (const victim of live) {
      if (!overCeiling() && !overMemory()) break;
      handled.add(victim.alias);
      if (overMemory() || !this.canSuspend || !cpuBacked(victim) || victim.state === 'suspended') {
        // Need memory back now (or can't cheaply suspend): terminate.
        terminated.push(victim);
        if (Number.isFinite(free)) free += footprint(victim.alias);
      } else {
        // Just over the warm ceiling: freeze it - revive is a SIGCONT.
        if (this.suspendRecord(victim)) {
          suspended.push(victim);
          this.registry.setStatus(victim.alias, 'suspended');
        } else {
          terminated.push(victim);
        }
      }
    }

    if (terminated.length) {
      const ports = terminated.map((r) => this.manifest.agents.find((a) => a.alias === r.alias)?.port).filter(Boolean);
      await Promise.all(terminated.map((r) => this.stop(r.alias)));
      await this.waitForPortsFree(ports);
    }
    return { suspended: suspended.map((r) => r.alias), terminated: terminated.map((r) => r.alias) };
  }

  /** True when something still accepts TCP on loopback:port (SIGSTOP'd listener counts as busy). */
  portBusy(port, timeoutMs = 400) {
    return new Promise((resolve) => {
      const sock = net.connect({ host: '127.0.0.1', port: Number(port) });
      const done = (busy) => {
        sock.removeAllListeners();
        try { sock.destroy(); } catch {}
        resolve(busy);
      };
      sock.setTimeout(timeoutMs, () => done(true)); // timeout => treat as still bound (PF7)
      sock.once('connect', () => done(true));
      sock.once('error', (err) => done(err && err.code !== 'ECONNREFUSED'));
    });
  }

  /** Poll until ports are bind-free. Timeout => still occupied (fail closed; RF4/PF7). */
  async waitForPortsFree(ports, { timeoutMs = 8000 } = {}) {
    if (!ports?.length) return true;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const busy = await Promise.all(ports.map((p) => this.portBusy(p)));
      if (!busy.some(Boolean)) return true;
      await sleep(150);
    }
    return false;
  }

  async sweepIdle(now = Date.now()) {
    const specialists = [...this.processes.values()].filter((r) =>
      r.owned && !r.resident && !this.isPinned(r.alias) && (r.refs ?? 0) === 0 && r.child.exitCode === null && !this.starting.has(r.alias));
    const ready = specialists.filter((r) => r.state === 'ready');
    ready.sort((a, b) => (b.lastUsedAt ?? b.createdAt ?? 0) - (a.lastUsedAt ?? a.createdAt ?? 0));
    const overCap = new Set(ready.slice(Math.max(0, this.maxWarmSpecialists)).map((r) => r.alias));

    const doomed = [];
    for (const r of ready) {
      const idleFor = now - (r.lastUsedAt ?? r.createdAt ?? now);
      if (!overCap.has(r.alias) && idleFor < this.idleEvictMs) continue;
      // Freeze the merely-idle ones (cheap revive); over-cap or long-idle -> terminate.
      if (this.canSuspend && overCap.has(r.alias) === false && idleFor < this.idleEvictMs * 3) {
        if (this.suspendRecord(r)) { this.registry.setStatus(r.alias, 'suspended'); continue; }
      }
      doomed.push(r);
    }
    // A model suspended and untouched for a long time: fully reclaim it.
    for (const r of specialists) {
      if (r.state === 'suspended' && now - (r.lastUsedAt ?? r.createdAt ?? now) > this.idleEvictMs * 3) doomed.push(r);
    }
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

  async slotIsIdle(port) {
    if (!port) return false;
    try {
      const res = await this.fetch(`http://127.0.0.1:${port}/slots`, {
        signal: AbortSignal.timeout(800),
        headers: { connection: 'close' },
      });
      let json = null;
      try {
        json = typeof res.json === 'function' ? await res.json() : null;
      } catch { json = null; }
      if (json == null) return true;
      const slots = Array.isArray(json) ? json : (json?.slots ?? []);
      const list = Array.isArray(slots) ? slots : [];
      if (list.length) return list.every((slot) => slot?.is_processing !== true);
      if (typeof json === 'object' && 'is_processing' in json) return json.is_processing !== true;
      return true;
    } catch {
      return false;
    }
  }

  async waitSlotIdle(port, { timeoutMs = 2000, intervalMs = 80 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.slotIsIdle(port)) return true;
      await sleep(intervalMs);
    }
    return false;
  }
}
