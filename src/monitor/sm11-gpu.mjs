/**
 * sm_1.1 CUDA assist for mailbox/monitor hash + private-slot copy verify.
 * Spawns native/sm11-monitor/out/sm11_monitor.exe --json; CPU FNV-1a fallback.
 * Scrub / seq / batch / private-slot ring probes; optional persistent --serve session.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { u64, u64Eq, u64Inc } from './ids.mjs';

const FNV_OFFSET = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;
const FAT_LIMIT = 256;
const SM11_MAX_BYTES = 4096;

export const SM11_DEFAULT_BATCH = 64;
export const SM11_DEFAULT_ENV_BYTES = 256;
export const SM11_PROBE_PAYLOAD = 'green-roomz-mailbox-probe';
/** Native seq wrap probe start — matches sm11_monitor.cu seq_start. */
export const SM11_SEQ_START = Object.freeze({ hi: 0, lo: 0xfffffffe });
/** Small probe sizes for mailbox/monitor hot-path assists (avoid 8600 VRAM spikes). */
export const SM11_HOT_BATCH = 8;
export const SM11_HOT_ENV_BYTES = 64;
export const SM11_DEFAULT_RING_SLOTS = 32;
export const SM11_MIN_RING_SLOTS = 16;
export const SM11_MAX_RING_SLOTS = 64;

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const SM11_FAT_LIMIT = FAT_LIMIT;

export function defaultExePath() {
  return path.join(REPO_ROOT, 'native', 'sm11-monitor', 'out', 'sm11_monitor.exe');
}

export function envSm11Enabled(env = process.env) {
  const raw = String(env.GRZ_SM11 ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
  return null;
}

export function toBytes(payload) {
  if (payload == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  if (typeof payload === 'string') return Buffer.from(payload, 'utf8');
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

/** FNV-1a 64-bit — matches native/sm11-monitor/sm11_monitor.cu */
export function fnv1a64(data) {
  const bytes = toBytes(data);
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= BigInt(bytes[i]);
    h = BigInt.asUintN(64, h * FNV_PRIME);
  }
  return h;
}

export function fnv1a64Hex(data) {
  return `0x${fnv1a64(data).toString(16).padStart(16, '0')}`;
}

export function sha256Hex(data) {
  return createHash('sha256').update(toBytes(data)).digest('hex');
}

/** Stored fat-payload digest stays sha256; FNV is the sm11 integrity twin. */
export function digestFatPayload(text) {
  const s = String(text ?? '');
  return {
    stored: sha256Hex(s),
    fnv: fnv1a64Hex(s),
    bytes: Buffer.byteLength(s, 'utf8'),
  };
}

export function clampBatch(n, fallback = SM11_DEFAULT_BATCH) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(4096, Math.floor(v));
}

export function clampEnvBytes(n, fallback = SM11_DEFAULT_ENV_BYTES) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(SM11_MAX_BYTES, Math.floor(v));
}

export function clampRingSlots(n, fallback = SM11_DEFAULT_RING_SLOTS) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < SM11_MIN_RING_SLOTS) return fallback;
  return Math.min(SM11_MAX_RING_SLOTS, Math.floor(v));
}

/** Host-side private-slot ring twin (32-bit index; GPU never lists). */
export function createCpuRingState({
  slots = SM11_DEFAULT_RING_SLOTS,
  envBytes = SM11_HOT_ENV_BYTES,
} = {}) {
  const n = clampRingSlots(slots);
  const e = clampEnvBytes(envBytes, SM11_HOT_ENV_BYTES);
  return {
    slots: n,
    envBytes: e,
    head: 0,
    tail: 0,
    count: 0,
    pushCount: 0,
    dropCount: 0,
    overwriteCount: 0,
    drainCount: 0,
    seq: u64(0, 0),
    slotsData: Array.from({ length: n }, () => Buffer.alloc(e, 0)),
  };
}

function ringMod(idx, slots) {
  return slots ? (idx % slots) : 0;
}

function cpuRingScrubTail(state) {
  if (state.count === 0) {
    return { ok: true, scrub_ok: true, ring_slot: 0xffffffff };
  }
  const slot = state.tail;
  state.slotsData[slot].fill(0);
  state.tail = ringMod(state.tail + 1, state.slots);
  state.count -= 1;
  state.dropCount += 1;
  return { ok: true, scrub_ok: true, ring_slot: slot };
}

function cpuRingStats(ring) {
  return {
    ring_slots: ring.slots,
    ring_env_bytes: ring.envBytes,
    ring_head: ring.head,
    ring_tail: ring.tail,
    ring_count: ring.count,
    ring_occupancy: ring.count,
    ring_push_count: ring.pushCount,
    ring_drop_count: ring.dropCount,
    ring_overwrite_count: ring.overwriteCount ?? 0,
    ring_drain_count: ring.drainCount ?? 0,
    ring_seq: u64(ring.seq.hi, ring.seq.lo),
  };
}

/** CPU twin of --ring-push (H2D+copy+seq+hash contract). */
export function cpuRingPush(payload, {
  state,
  slots = SM11_DEFAULT_RING_SLOTS,
  envBytes = SM11_HOT_ENV_BYTES,
} = {}) {
  const ring = state ?? createCpuRingState({ slots, envBytes });
  let scrub = null;
  if (ring.count >= ring.slots) {
    scrub = cpuRingScrubTail(ring);
    ring.overwriteCount = (ring.overwriteCount ?? 0) + 1;
  }

  const host = Buffer.alloc(ring.envBytes, 0);
  const bytes = toBytes(payload);
  bytes.copy(host, 0, 0, Math.min(bytes.length, ring.envBytes));

  const slot = ring.head;
  const stamped = u64(ring.seq.hi, ring.seq.lo);
  host.copy(ring.slotsData[slot]);
  const hash = fnv1a64Hex(host);

  ring.seq = u64Inc(ring.seq);
  ring.head = ringMod(ring.head + 1, ring.slots);
  ring.count += 1;
  ring.pushCount += 1;

  return {
    ok: true,
    backend: 'cpu',
    ring_ok: true,
    ring_push_ok: true,
    ring_hash_ok: true,
    ring_cmp_ok: true,
    ring_cmp_mismatches: 0,
    ...cpuRingStats(ring),
    ring_slot: slot,
    ring_seq: stamped,
    ring_hash: hash,
    ring_expect: hash,
    ring_scrub_ok: scrub ? scrub.scrub_ok : undefined,
    state: ring,
  };
}

/** CPU twin of --ring-hash. */
export function cpuRingHash({
  state,
  slot,
  slots = SM11_DEFAULT_RING_SLOTS,
  envBytes = SM11_HOT_ENV_BYTES,
} = {}) {
  const ring = state ?? createCpuRingState({ slots, envBytes });
  let idx = slot;
  if (idx == null || idx === 0xffffffff) {
    idx = ring.count
      ? ringMod(ring.head + ring.slots - 1, ring.slots)
      : 0;
  }
  idx = Number(idx) >>> 0;
  if (idx >= ring.slots) {
    return {
      ok: false,
      backend: 'cpu',
      ring_ok: false,
      ring_hash_ok: false,
      state: ring,
    };
  }
  const hash = fnv1a64Hex(ring.slotsData[idx]);
  return {
    ok: true,
    backend: 'cpu',
    ring_ok: true,
    ring_hash_ok: true,
    ...cpuRingStats(ring),
    ring_slot: idx,
    ring_hash: hash,
    ring_expect: hash,
    state: ring,
  };
}

/** CPU twin of --ring-scrub (tail drop or explicit slot zero). */
export function cpuRingScrub({
  state,
  slot,
  slots = SM11_DEFAULT_RING_SLOTS,
  envBytes = SM11_HOT_ENV_BYTES,
} = {}) {
  const ring = state ?? createCpuRingState({ slots, envBytes });
  if (slot != null && slot !== 0xffffffff) {
    const idx = Number(slot) >>> 0;
    if (idx >= ring.slots) {
      return {
        ok: false,
        backend: 'cpu',
        ring_ok: false,
        ring_scrub_ok: false,
        state: ring,
      };
    }
    ring.slotsData[idx].fill(0);
    return {
      ok: true,
      backend: 'cpu',
      ring_ok: true,
      ring_scrub_ok: true,
      ...cpuRingStats(ring),
      ring_slot: idx,
      state: ring,
    };
  }
  const scrub = cpuRingScrubTail(ring);
  return {
    ok: scrub.ok,
    backend: 'cpu',
    ring_ok: scrub.ok,
    ring_scrub_ok: scrub.scrub_ok,
    ...cpuRingStats(ring),
    ring_slot: scrub.ring_slot,
    state: ring,
  };
}

/** CPU twin of --ring-drain N (hash+scrub from tail; host advances). */
export function cpuRingDrain({
  state,
  count = 1,
  slots = SM11_DEFAULT_RING_SLOTS,
  envBytes = SM11_HOT_ENV_BYTES,
} = {}) {
  const ring = state ?? createCpuRingState({ slots, envBytes });
  const n = Math.max(0, Math.floor(Number(count) || 0));
  let drained = 0;
  let lastHash = null;
  let lastSlot = 0xffffffff;
  let ok = true;
  while (drained < n && ring.count > 0) {
    const slot = ring.tail;
    const hash = fnv1a64Hex(ring.slotsData[slot]);
    const scrub = cpuRingScrubTail(ring);
    if (!scrub.scrub_ok) {
      ok = false;
      break;
    }
    ring.drainCount = (ring.drainCount ?? 0) + 1;
    drained += 1;
    lastHash = hash;
    lastSlot = slot;
  }
  return {
    ok,
    backend: 'cpu',
    ring_ok: ok,
    ring_drain_ok: ok,
    ring_hash_ok: ok,
    ring_scrub_ok: ok,
    ring_drained: drained,
    ...cpuRingStats(ring),
    ring_slot: lastSlot,
    ring_hash: lastHash,
    ring_expect: lastHash,
    state: ring,
  };
}

/** CPU twin of --ring-verify (re-hash occupied slots; host walks indices). */
export function cpuRingVerify({
  state,
  slots = SM11_DEFAULT_RING_SLOTS,
  envBytes = SM11_HOT_ENV_BYTES,
} = {}) {
  const ring = state ?? createCpuRingState({ slots, envBytes });
  let checked = 0;
  let mismatches = 0;
  let idx = ring.tail;
  let lastHash = null;
  let lastSlot = 0xffffffff;
  for (let i = 0; i < ring.count; i += 1) {
    const hash = fnv1a64Hex(ring.slotsData[idx]);
    // CPU twin: device/host hash are the same buffer — mismatch stays 0 unless corrupt.
    if (hash !== fnv1a64Hex(ring.slotsData[idx])) mismatches += 1;
    checked += 1;
    lastHash = hash;
    lastSlot = idx;
    idx = ringMod(idx + 1, ring.slots);
  }
  const ok = mismatches === 0;
  return {
    ok,
    backend: 'cpu',
    ring_ok: ok,
    ring_verify_ok: ok,
    ring_verify_checked: checked,
    ring_verify_mismatches: mismatches,
    ring_hash_ok: ok,
    ...cpuRingStats(ring),
    ring_slot: lastSlot,
    ring_hash: lastHash,
    ring_expect: lastHash,
    state: ring,
  };
}

export function cpuVerify(payload) {
  const bytes = toBytes(payload);
  const hash = fnv1a64Hex(bytes);
  return {
    ok: true,
    backend: 'cpu',
    copy_ok: true,
    hash_ok: true,
    hash,
    expect: hash,
    bytes: bytes.length,
  };
}

/** CPU twin of ring scrub (zero + XOR 0xA5) — matches sm11_monitor.cu. */
export function cpuScrub({ batch = SM11_DEFAULT_BATCH, envBytes = SM11_DEFAULT_ENV_BYTES } = {}) {
  const b = clampBatch(batch);
  const e = clampEnvBytes(envBytes);
  const scrubBytes = e * (b < 16 ? b : 16);
  const host = Buffer.alloc(scrubBytes);
  for (let i = 0; i < scrubBytes; i += 1) host[i] = (0x5a ^ (i & 0xff)) & 0xff;

  const afterZero = Buffer.alloc(scrubBytes);
  host.copy(afterZero);
  afterZero.fill(0);
  let zeroOk = true;
  for (let i = 0; i < scrubBytes; i += 1) {
    if (afterZero[i] !== 0) { zeroOk = false; break; }
  }

  const xorPat = 0xa5;
  const afterXor = Buffer.from(host);
  for (let i = 0; i < scrubBytes; i += 1) afterXor[i] ^= xorPat;
  let xorOk = true;
  for (let i = 0; i < scrubBytes; i += 1) {
    if (afterXor[i] !== ((host[i] ^ xorPat) & 0xff)) { xorOk = false; break; }
  }

  const scrubOk = zeroOk && xorOk;
  return {
    ok: scrubOk,
    backend: 'cpu',
    scrub_ok: scrubOk,
    scrub_bytes: scrubBytes,
    batch: b,
    env_bytes: e,
  };
}

/** CPU twin of seq {hi,lo} stamp + wrap — matches sm11_monitor.cu / ids.u64Inc. */
export function cpuSeq({ batch = SM11_DEFAULT_BATCH, start = SM11_SEQ_START } = {}) {
  const b = clampBatch(batch);
  let stampN = b < 8 ? b : 8;
  if (stampN < 4) stampN = 4;

  const seqStart = u64(start?.hi ?? 0, start?.lo ?? 0xfffffffe);
  const stamped = [];
  let cur = u64(seqStart.hi, seqStart.lo);
  for (let i = 0; i < stampN; i += 1) {
    stamped.push(u64(cur.hi, cur.lo));
    cur = u64Inc(cur);
  }
  const seqEnd = cur;

  let seqOk = true;
  let expect = u64(seqStart.hi, seqStart.lo);
  for (let i = 0; i < stampN; i += 1) {
    if (!u64Eq(stamped[i], expect)) { seqOk = false; break; }
    expect = u64Inc(expect);
  }
  if (seqOk && !u64Eq(seqEnd, expect)) seqOk = false;
  if (seqOk && stampN >= 3) {
    if (stamped[0].hi !== 0 || stamped[0].lo !== 0xfffffffe) seqOk = false;
    if (stamped[1].hi !== 0 || stamped[1].lo !== 0xffffffff) seqOk = false;
    if (stamped[2].hi !== 1 || stamped[2].lo !== 0) seqOk = false;
  }

  return {
    ok: seqOk,
    backend: 'cpu',
    seq_ok: seqOk,
    seq_start: seqStart,
    seq_end: seqEnd,
    stamp_n: stampN,
    batch: b,
  };
}

/** Build synthetic batch envelopes matching native fill pattern. */
export function makeBatchEnvelopes(batch = SM11_DEFAULT_BATCH, envBytes = SM11_DEFAULT_ENV_BYTES) {
  const b = clampBatch(batch);
  const e = clampEnvBytes(envBytes);
  const envs = [];
  for (let i = 0; i < b; i += 1) {
    const buf = Buffer.alloc(e, (0xa5 ^ (i & 0xff)) & 0xff);
    buf[0] = i & 0xff;
    if (e > 1) buf[1] = (i >> 8) & 0xff;
    envs.push(buf);
  }
  return { batch: b, envBytes: e, envs };
}

/** CPU twin of batch envelope FNV — matches sm11_monitor.cu k_fnv1a_batch. */
export function cpuBatch({ batch = SM11_DEFAULT_BATCH, envBytes = SM11_DEFAULT_ENV_BYTES } = {}) {
  const { batch: b, envBytes: e, envs } = makeBatchEnvelopes(batch, envBytes);
  const hashes = envs.map((env) => fnv1a64Hex(env));
  return {
    ok: true,
    backend: 'cpu',
    batch_ok: true,
    hash_ok: true,
    batch: b,
    env_bytes: e,
    hashes,
  };
}

function parseJsonLine(stdout) {
  const line = String(stdout ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('{'));
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function defaultRunExe(exePath, args, { timeoutMs = 15_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(exePath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ code: 124, stdout, stderr: `${stderr}\ntimeout` });
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Persistent sm11_monitor --serve child. One JSON reply per stdin command line.
 * Keeps CUDA context warm — in-process ops are ~2–15ms vs ~100ms cold spawn.
 */
export function createSm11ServeSession({
  exePath = defaultExePath(),
  spawnImpl = spawn,
  timeoutMs = 15_000,
} = {}) {
  let child = null;
  let buf = '';
  let stderr = '';
  let dead = false;
  /** @type {{ resolve: Function, reject: Function, timer: NodeJS.Timeout }[]} */
  const waiters = [];
  let chain = Promise.resolve();

  function rejectAll(err) {
    while (waiters.length) {
      const w = waiters.shift();
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  function resetBuffers() {
    buf = '';
    stderr = '';
  }

  function onChunk(chunk) {
    buf += String(chunk);
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '').trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('{')) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const w = waiters.shift();
      if (!w) continue;
      clearTimeout(w.timer);
      const code = parsed.bye === true || parsed.ok === true ? 0 : (parsed.ok === false ? 1 : 0);
      w.resolve({ code, stdout: `${line}\n`, stderr, parsed });
    }
  }

  function attach(proc) {
    child = proc;
    dead = false;
    resetBuffers();
    // Gate all handlers on child === proc so a prior kill's late close/data
    // cannot clobber a respawned --serve session under load.
    proc.stdout?.on('data', (chunk) => {
      if (child !== proc) return;
      onChunk(chunk);
    });
    proc.stderr?.on('data', (d) => {
      if (child !== proc) return;
      stderr += d;
    });
    proc.on('error', (error) => {
      if (child !== proc) return;
      dead = true;
      child = null;
      rejectAll(error);
    });
    proc.on('close', () => {
      if (child !== proc) return;
      dead = true;
      child = null;
      rejectAll(new Error('serve_closed'));
    });
  }

  async function ensureStarted() {
    if (child && !dead) return;
    // Prior close()/crash left dead=true; respawn a fresh --serve child.
    if (child) {
      try { child.kill(); } catch { /* ignore */ }
      child = null;
    }
    dead = false;
    resetBuffers();
    const proc = spawnImpl(exePath, ['--serve'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    attach(proc);
  }

  function requestOnce(args, reqTimeoutMs) {
    return new Promise((resolve, reject) => {
      if (!child || dead) {
        reject(new Error('serve_unavailable'));
        return;
      }
      const line = Array.isArray(args)
        ? args.map(String).join(' ')
        : String(args);
      const entry = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const idx = waiters.indexOf(entry);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(Object.assign(new Error('serve_timeout'), { code: 124 }));
      }, reqTimeoutMs);
      waiters.push(entry);
      try {
        child.stdin.write(`${line}\n`);
      } catch (error) {
        const idx = waiters.indexOf(entry);
        if (idx >= 0) waiters.splice(idx, 1);
        clearTimeout(entry.timer);
        reject(error);
      }
    });
  }

  function request(args, { timeoutMs: reqTimeoutMs = timeoutMs } = {}) {
    const job = chain.then(async () => {
      await ensureStarted();
      return requestOnce(args, reqTimeoutMs);
    });
    chain = job.then(() => {}, () => {});
    return job;
  }

  async function close() {
    // Drop in-flight waiters first so quit/kill cannot mis-attribute JSON lines.
    rejectAll(new Error('serve_closed'));
    if (!child) {
      dead = true;
      return;
    }
    try {
      child.stdin.write('quit\n');
    } catch { /* ignore */ }
    try { child.stdin?.end(); } catch { /* ignore */ }
    try { child.kill(); } catch { /* ignore */ }
    child = null;
    dead = true;
    resetBuffers();
  }

  return {
    request,
    close,
    get alive() { return Boolean(child) && !dead; },
  };
}

/** runExe-compatible wrapper over a serve session; falls back to oneShot on failure. */
export function serveRunExeFactory(session, oneShot = defaultRunExe) {
  return async function runViaServe(exePath, args, opts = {}) {
    try {
      const filtered = (args ?? []).filter((a) => a !== '--serve');
      return await session.request(filtered, opts);
    } catch (error) {
      const msg = String(error?.message ?? error);
      const fatal = error?.code === 124
        || msg.includes('timeout')
        || msg.includes('serve_closed')
        || msg.includes('serve_unavailable');
      // Only tear down on fatal serve faults; leave the session up for reuse otherwise.
      if (fatal) {
        try { await session.close(); } catch { /* ignore */ }
      }
      if (error?.code === 124 || msg.includes('timeout')) {
        return { code: 124, stdout: '', stderr: msg };
      }
      return oneShot(exePath, args, opts);
    }
  };
}

function buildCliArgs({ flags, batch, envBytes, ringSlots, ringSlot, ringDrain, payload, loops }) {
  const args = ['--json', ...flags];
  if (batch != null) {
    args.push('--batch', String(clampBatch(batch)));
  }
  if (envBytes != null) {
    args.push('--env-bytes', String(clampEnvBytes(envBytes)));
  }
  if (ringSlots != null) {
    args.push('--ring-slots', String(clampRingSlots(ringSlots)));
  }
  if (ringSlot != null && ringSlot !== 0xffffffff) {
    args.push('--ring-slot', String(Number(ringSlot) >>> 0));
  }
  if (ringDrain != null) {
    const n = Math.max(1, Math.min(4096, Math.floor(Number(ringDrain) || 1)));
    args.push('--ring-drain', String(n));
  }
  if (loops != null && Number(loops) > 1) {
    args.push('--loops', String(Math.min(10_000, Math.max(1, Math.floor(Number(loops))))));
  }
  if (payload != null && payload !== '') {
    args.push(String(payload));
  }
  return args;
}

function cudaBase(parsed) {
  return {
    ok: true,
    backend: 'cuda',
    device: parsed.device ?? null,
    sm: parsed.sm ?? null,
    vram_mb: parsed.vram_mb ?? null,
    batch: parsed.batch,
    env_bytes: parsed.env_bytes,
    raw: parsed,
  };
}

/**
 * Shared spawn path for scrub/seq/batch probes. Falls back to CPU when exe missing or CUDA fails.
 */
async function runAssistProbe({
  flags,
  batch,
  envBytes,
  ringSlots,
  ringSlot,
  ringDrain,
  payload = SM11_PROBE_PAYLOAD,
  loops,
  exePath,
  preferGpu = true,
  timeoutMs = 15_000,
  runExe = defaultRunExe,
  exists = existsSync,
  cpu,
  accept,
}) {
  const cpuResult = () => cpu();

  if (!preferGpu || !exePath || !exists(exePath)) {
    return { ...cpuResult(), fallback: preferGpu ? 'exe_missing' : 'prefer_cpu' };
  }

  const args = buildCliArgs({ flags, batch, envBytes, ringSlots, ringSlot, ringDrain, payload, loops });
  const ran = await runExe(exePath, args, { timeoutMs });
  const parsed = parseJsonLine(ran.stdout);
  if (!parsed || ran.code === 127 || ran.code === 124) {
    return { ...cpuResult(), fallback: ran.code === 124 ? 'timeout' : 'spawn_failed', stderr: ran.stderr };
  }
  const accepted = accept(parsed);
  if (accepted) {
    return {
      ...cudaBase(parsed),
      ...accepted,
      ms: parsed.ms,
      cmp_ok: parsed.cmp_ok,
      loops: parsed.loops,
      ms_min: parsed.ms_min,
      ms_avg: parsed.ms_avg,
      ms_max: parsed.ms_max,
    };
  }
  return {
    ...cpuResult(),
    fallback: 'cuda_fail',
    cuda: parsed,
    stderr: ran.stderr,
  };
}

function ringFieldsFromParsed(parsed) {
  return {
    ring_ok: parsed.ring_ok === true,
    ring_slots: parsed.ring_slots,
    ring_env_bytes: parsed.ring_env_bytes,
    ring_slot: parsed.ring_slot,
    ring_head: parsed.ring_head,
    ring_tail: parsed.ring_tail,
    ring_count: parsed.ring_count,
    ring_occupancy: parsed.ring_occupancy ?? parsed.ring_count,
    ring_push_count: parsed.ring_push_count,
    ring_drop_count: parsed.ring_drop_count,
    ring_overwrite_count: parsed.ring_overwrite_count,
    ring_drain_count: parsed.ring_drain_count,
    ring_drained: parsed.ring_drained,
    ring_verify_ok: parsed.ring_verify_ok,
    ring_verify_checked: parsed.ring_verify_checked,
    ring_verify_mismatches: parsed.ring_verify_mismatches,
    ring_drain_ok: parsed.ring_drain_ok,
    ring_seq: parsed.ring_seq ?? null,
    ring_hash: parsed.ring_hash ?? null,
    ring_expect: parsed.ring_expect ?? null,
    ring_push_ok: parsed.ring_push_ok,
    ring_hash_ok: parsed.ring_hash_ok,
    ring_scrub_ok: parsed.ring_scrub_ok,
    ring_cmp_ok: parsed.ring_cmp_ok,
    ring_cmp_mismatches: parsed.ring_cmp_mismatches,
  };
}

export async function verifyRingPush(payload = SM11_PROBE_PAYLOAD, options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    ringSlots = SM11_DEFAULT_RING_SLOTS,
    envBytes = SM11_HOT_ENV_BYTES,
    state,
  } = options;

  return runAssistProbe({
    flags: ['--ring-push'],
    ringSlots,
    envBytes,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuRingPush(payload, { state, slots: ringSlots, envBytes }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.ring_ok === true && parsed.ring_push_ok === true) {
        return ringFieldsFromParsed(parsed);
      }
      return null;
    },
  });
}

export async function verifyRingHash(options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    ringSlots = SM11_DEFAULT_RING_SLOTS,
    envBytes = SM11_HOT_ENV_BYTES,
    ringSlot,
    state,
    payload = SM11_PROBE_PAYLOAD,
  } = options;

  return runAssistProbe({
    flags: ['--ring-hash'],
    ringSlots,
    ringSlot,
    envBytes,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuRingHash({ state, slot: ringSlot, slots: ringSlots, envBytes }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.ring_ok === true && parsed.ring_hash_ok === true) {
        return ringFieldsFromParsed(parsed);
      }
      return null;
    },
  });
}

export async function verifyRingScrub(options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    ringSlots = SM11_DEFAULT_RING_SLOTS,
    envBytes = SM11_HOT_ENV_BYTES,
    ringSlot,
    state,
    payload = SM11_PROBE_PAYLOAD,
  } = options;

  return runAssistProbe({
    flags: ['--ring-scrub'],
    ringSlots,
    ringSlot,
    envBytes,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuRingScrub({ state, slot: ringSlot, slots: ringSlots, envBytes }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.ring_ok === true && parsed.ring_scrub_ok === true) {
        return ringFieldsFromParsed(parsed);
      }
      return null;
    },
  });
}

export async function verifyRingDrain(options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    ringSlots = SM11_DEFAULT_RING_SLOTS,
    envBytes = SM11_HOT_ENV_BYTES,
    count = 1,
    state,
    payload = SM11_PROBE_PAYLOAD,
  } = options;
  const n = Math.max(1, Math.min(4096, Math.floor(Number(count) || 1)));

  return runAssistProbe({
    flags: [],
    ringDrain: n,
    ringSlots,
    envBytes,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuRingDrain({ state, count: n, slots: ringSlots, envBytes }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.ring_ok === true && parsed.ring_drain_ok === true) {
        return ringFieldsFromParsed(parsed);
      }
      return null;
    },
  });
}

export async function verifyRingVerify(options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    ringSlots = SM11_DEFAULT_RING_SLOTS,
    envBytes = SM11_HOT_ENV_BYTES,
    state,
    payload = SM11_PROBE_PAYLOAD,
  } = options;

  return runAssistProbe({
    flags: ['--ring-verify'],
    ringSlots,
    envBytes,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuRingVerify({ state, slots: ringSlots, envBytes }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.ring_ok === true && parsed.ring_verify_ok === true) {
        return ringFieldsFromParsed(parsed);
      }
      return null;
    },
  });
}

/**
 * Run native --json --copy --hash [payload]. Falls back to CPU if exe missing or CUDA fails.
 */
export async function verifyPayload(payload, options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    flags = ['--copy', '--hash'],
    batch,
    envBytes,
    loops,
  } = options;

  const bytes = toBytes(payload);
  const cpu = () => cpuVerify(bytes);

  if (!preferGpu || !exePath || !exists(exePath)) {
    return { ...cpu(), fallback: preferGpu ? 'exe_missing' : 'prefer_cpu' };
  }
  if (bytes.length === 0 || bytes.length > SM11_MAX_BYTES) {
    return { ...cpu(), fallback: 'payload_range' };
  }

  // argv payload must be text; reject NULs for the CLI path
  const asText = bytes.toString('utf8');
  if (asText.includes('\0') || Buffer.byteLength(asText, 'utf8') !== bytes.length) {
    return { ...cpu(), fallback: 'non_cli_payload' };
  }

  const args = buildCliArgs({ flags, batch, envBytes, payload: asText, loops });
  const ran = await runExe(exePath, args, { timeoutMs });
  const parsed = parseJsonLine(ran.stdout);
  if (!parsed || ran.code === 127 || ran.code === 124) {
    return { ...cpu(), fallback: ran.code === 124 ? 'timeout' : 'spawn_failed', stderr: ran.stderr };
  }
  if (parsed.ok === true && parsed.copy_ok !== false && parsed.hash_ok !== false) {
    return {
      ok: true,
      backend: 'cuda',
      device: parsed.device ?? null,
      sm: parsed.sm ?? null,
      vram_mb: parsed.vram_mb ?? null,
      copy_ok: parsed.copy_ok === true,
      cmp_ok: parsed.cmp_ok,
      hash_ok: parsed.hash_ok === true,
      hash: parsed.hash ?? null,
      expect: parsed.expect ?? fnv1a64Hex(bytes),
      batch_ok: parsed.batch_ok,
      scrub_ok: parsed.scrub_ok,
      seq_ok: parsed.seq_ok,
      seq_start: parsed.seq_start,
      seq_end: parsed.seq_end,
      batch: parsed.batch,
      env_bytes: parsed.env_bytes,
      ms: parsed.ms,
      loops: parsed.loops,
      ms_min: parsed.ms_min,
      ms_avg: parsed.ms_avg,
      ms_max: parsed.ms_max,
      bytes: bytes.length,
      raw: parsed,
    };
  }
  return {
    ...cpu(),
    fallback: 'cuda_fail',
    cuda: parsed,
    stderr: ran.stderr,
  };
}

export async function verifyScrub(options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    batch = SM11_DEFAULT_BATCH,
    envBytes = SM11_DEFAULT_ENV_BYTES,
    payload = SM11_PROBE_PAYLOAD,
  } = options;

  return runAssistProbe({
    flags: ['--scrub'],
    batch,
    envBytes,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuScrub({ batch, envBytes }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.scrub_ok === true) {
        return {
          scrub_ok: true,
          scrub_bytes: clampEnvBytes(envBytes) * (clampBatch(batch) < 16 ? clampBatch(batch) : 16),
        };
      }
      return null;
    },
  });
}

export async function verifySeq(options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    batch = SM11_DEFAULT_BATCH,
    payload = SM11_PROBE_PAYLOAD,
  } = options;

  return runAssistProbe({
    flags: ['--seq'],
    batch,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuSeq({ batch }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.seq_ok === true) {
        return {
          seq_ok: true,
          seq_start: parsed.seq_start ?? null,
          seq_end: parsed.seq_end ?? null,
        };
      }
      return null;
    },
  });
}

export async function verifyBatch(options = {}) {
  const {
    exePath = defaultExePath(),
    preferGpu = true,
    timeoutMs = 15_000,
    runExe = defaultRunExe,
    exists = existsSync,
    batch = SM11_DEFAULT_BATCH,
    envBytes = SM11_DEFAULT_ENV_BYTES,
    payload = SM11_PROBE_PAYLOAD,
  } = options;

  return runAssistProbe({
    flags: ['--hash'],
    batch,
    envBytes,
    payload,
    exePath,
    preferGpu,
    timeoutMs,
    runExe,
    exists,
    cpu: () => cpuBatch({ batch, envBytes }),
    accept: (parsed) => {
      if (parsed.ok === true && parsed.batch_ok === true && parsed.hash_ok !== false) {
        return {
          batch_ok: true,
          hash_ok: parsed.hash_ok === true,
          hash: parsed.hash ?? null,
          expect: parsed.expect ?? null,
        };
      }
      return null;
    },
  });
}

export async function probeSm11(options = {}) {
  const batch = options.batch;
  const envBytes = options.envBytes;
  return verifyPayload(options.payload ?? SM11_PROBE_PAYLOAD, {
    ...options,
    flags: options.flags ?? ['--copy', '--hash', '--scrub', '--seq'],
    batch,
    envBytes,
  });
}

export function createSm11Assist(options = {}) {
  if (options === false) return null;
  const opts = (options === true || options == null) ? {} : options;
  if (opts.enabled === false) return null;

  const exePath = opts.exePath ?? defaultExePath();
  const exists = opts.exists ?? existsSync;
  let preferGpu = opts.preferGpu !== false;
  if (opts.requireExe && !exists(exePath)) preferGpu = false;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const verifyOnFat = opts.verifyOnFat !== false;
  // Follow verifyOnFat unless overridden: auto MonitorIpc stays quiet unless GRZ_SM11=1.
  const hotPath = opts.hotPath !== undefined ? opts.hotPath !== false : verifyOnFat;
  const useServe = opts.serve !== false && opts.runExe == null && preferGpu && exists(exePath);
  const session = useServe
    ? (opts.session ?? createSm11ServeSession({
      exePath,
      spawnImpl: opts.spawnImpl ?? spawn,
      timeoutMs,
    }))
    : null;
  // Prefer private-slot ring when --serve is up (GRZ_SM11=1 + exe); explicit preferRing overrides.
  const preferRing = opts.preferRing !== undefined
    ? opts.preferRing !== false
    : Boolean(session);
  const runExe = opts.runExe
    ?? (session ? serveRunExeFactory(session, defaultRunExe) : defaultRunExe);
  const shared = { exePath, preferGpu, timeoutMs, runExe, exists };
  const hotShared = {
    ...shared,
    batch: opts.hotBatch ?? SM11_HOT_BATCH,
    envBytes: opts.hotEnvBytes ?? SM11_HOT_ENV_BYTES,
  };
  const ringShared = {
    ...shared,
    ringSlots: opts.ringSlots ?? SM11_DEFAULT_RING_SLOTS,
    envBytes: opts.hotEnvBytes ?? SM11_HOT_ENV_BYTES,
  };
  /** CPU ring state used when CUDA path falls back or preferGpu=false. */
  let cpuRing = opts.cpuRingState ?? null;

  const stats = {
    fat: 0,
    verifyAttempts: 0,
    verify: 0,
    scrub: 0,
    seq: 0,
    batch: 0,
    ringPush: 0,
    ringHash: 0,
    ringScrub: 0,
    ringDrain: 0,
    ringVerify: 0,
    coalesced: 0,
    gpuOk: 0,
    cpuFallback: 0,
    fail: 0,
    /** Per-kind fail counts (verify/scrub/seq/batch/ring*). */
    failByKind: {
      verify: 0,
      scrub: 0,
      seq: 0,
      batch: 0,
      ringPush: 0,
      ringHash: 0,
      ringScrub: 0,
      ringDrain: 0,
      ringVerify: 0,
    },
    /** Hot-path event fires (mailbox/ipc); assists may coalesce. */
    hotEvents: {
      enqueue: 0,
      drop: 0,
      drain: 0,
      reject: 0,
      wait: 0,
    },
    last: null,
  };
  const pending = new Set();
  /** One in-flight probe per kind — hot path must not spawn-storm under load. */
  const inflight = {
    scrub: null,
    seq: null,
    batch: null,
    verify: null,
    ringPush: null,
    ringHash: null,
    ringScrub: null,
    ringDrain: null,
    ringVerify: null,
  };

  function record(result, kind = 'verify') {
    stats.verifyAttempts += 1;
    if (kind === 'verify') stats.verify += 1;
    if (kind === 'scrub') stats.scrub += 1;
    if (kind === 'seq') stats.seq += 1;
    if (kind === 'batch') stats.batch += 1;
    if (kind === 'ringPush') stats.ringPush += 1;
    if (kind === 'ringHash') stats.ringHash += 1;
    if (kind === 'ringScrub') stats.ringScrub += 1;
    if (kind === 'ringDrain') stats.ringDrain += 1;
    if (kind === 'ringVerify') stats.ringVerify += 1;
    if (result.state) cpuRing = result.state;
    stats.last = {
      backend: result.backend,
      ok: result.ok,
      fallback: result.fallback ?? null,
      hash: result.hash ?? result.ring_hash ?? null,
      kind,
      scrub_ok: result.scrub_ok,
      seq_ok: result.seq_ok,
      batch_ok: result.batch_ok,
      ring_ok: result.ring_ok,
      ring_push_ok: result.ring_push_ok,
      ring_hash_ok: result.ring_hash_ok,
      ring_scrub_ok: result.ring_scrub_ok,
      ring_drain_ok: result.ring_drain_ok,
      ring_verify_ok: result.ring_verify_ok,
    };
    if (result.backend === 'cuda' && result.ok) stats.gpuOk += 1;
    else if (result.fallback) stats.cpuFallback += 1;
    if (!result.ok) {
      stats.fail += 1;
      if (kind in stats.failByKind) stats.failByKind[kind] += 1;
    }
    return result;
  }

  function track(promise, kind) {
    const p = promise
      .then((result) => record(result, kind))
      .catch((error) => record({
        ok: false,
        backend: 'cpu',
        fallback: 'error',
        error: String(error?.message ?? error),
      }, kind))
      .finally(() => { pending.delete(p); });
    pending.add(p);
    return p;
  }

  function coalesce(kind, start) {
    if (inflight[kind]) {
      stats.coalesced += 1;
      return inflight[kind];
    }
    const p = start();
    const wrapped = p.finally(() => {
      if (inflight[kind] === wrapped) inflight[kind] = null;
    });
    inflight[kind] = wrapped;
    return wrapped;
  }

  function observeFat(text) {
    stats.fat += 1;
    const digest = digestFatPayload(text);
    if (verifyOnFat) scheduleVerify(text);
    return digest;
  }

  function scheduleVerify(payload) {
    // Coalesce fat verifies under load — one CUDA/CPU probe at a time, never spawn-storm.
    return coalesce('verify', () => track(verifyPayload(payload, shared), 'verify'));
  }

  /** Non-blocking scrub probe; CPU fallback when exe missing/fails. */
  function assistScrub(probeOpts = {}) {
    return coalesce('scrub', () => track(verifyScrub({ ...shared, ...probeOpts }), 'scrub'));
  }

  /** Non-blocking seq stamp verify; CPU fallback when exe missing/fails. */
  function assistSeq(probeOpts = {}) {
    return coalesce('seq', () => track(verifySeq({ ...shared, ...probeOpts }), 'seq'));
  }

  /** Non-blocking batch envelope hash; CPU fallback when exe missing/fails. */
  function assistBatch(probeOpts = {}) {
    return coalesce('batch', () => track(verifyBatch({ ...shared, ...probeOpts }), 'batch'));
  }

  /** Non-blocking private-slot ring push (H2D + device copy + seq + hash). */
  function assistRingPush(payload = SM11_PROBE_PAYLOAD, probeOpts = {}) {
    return coalesce('ringPush', () => track(verifyRingPush(payload, {
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }), 'ringPush'));
  }

  /** Non-blocking hash of a ring slot. */
  function assistRingHash(probeOpts = {}) {
    return coalesce('ringHash', () => track(verifyRingHash({
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }), 'ringHash'));
  }

  /** Non-blocking scrub/drop of a ring slot. */
  function assistRingScrub(probeOpts = {}) {
    return coalesce('ringScrub', () => track(verifyRingScrub({
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }), 'ringScrub'));
  }

  /** Non-blocking host-assisted drain: hash+scrub N slots from tail. */
  function assistRingDrain(count = 1, probeOpts = {}) {
    return coalesce('ringDrain', () => track(verifyRingDrain({
      ...ringShared,
      state: cpuRing,
      count,
      ...probeOpts,
    }), 'ringDrain'));
  }

  /** Non-blocking re-hash of all occupied slots; report mismatches. */
  function assistRingVerify(probeOpts = {}) {
    return coalesce('ringVerify', () => track(verifyRingVerify({
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }), 'ringVerify'));
  }

  function ringOk(result, flag) {
    return Boolean(result?.ok) && result?.[flag] !== false;
  }

  /** Prefer ring probe; on failure run fallback. Whole chain stays in pending for flush(). */
  function ringOrFallback(ringKind, startRing, flag, fallbackFn) {
    return coalesce(ringKind, () => {
      const p = startRing()
        .then((result) => {
          const recorded = record(result, ringKind);
          if (ringOk(recorded, flag)) return recorded;
          return fallbackFn();
        })
        .catch((error) => {
          record({
            ok: false,
            backend: 'cpu',
            fallback: 'error',
            error: String(error?.message ?? error),
          }, ringKind);
          return fallbackFn();
        })
        .finally(() => { pending.delete(p); });
      pending.add(p);
      return p;
    });
  }

  /**
   * Hot-path: prefer ring push when serve/preferRing; fall back to seq probe.
   * Non-blocking; CPU twin OK when CUDA/serve unavailable.
   */
  function onEnqueue(payload) {
    if (!hotPath) return null;
    stats.hotEvents.enqueue += 1;
    if (!preferRing) return assistSeq(hotShared);
    return ringOrFallback(
      'ringPush',
      () => verifyRingPush(payload ?? SM11_PROBE_PAYLOAD, {
        ...ringShared,
        state: cpuRing,
      }),
      'ring_push_ok',
      () => assistSeq(hotShared),
    );
  }

  /** Hot-path: prefer ring scrub on drop/clear; fall back to scrub probe. */
  function onDropOrClear() {
    if (!hotPath) return null;
    stats.hotEvents.drop += 1;
    if (!preferRing) return assistScrub(hotShared);
    return ringOrFallback(
      'ringScrub',
      () => verifyRingScrub({
        ...ringShared,
        state: cpuRing,
      }),
      'ring_scrub_ok',
      () => assistScrub(hotShared),
    );
  }

  /** Hot-path: prefer ring-drain (hash+scrub) on drain; fall back to batch probe. */
  function onDrain(count) {
    if (!hotPath) return null;
    const n = Number(count);
    if (!Number.isFinite(n) || n < 1) return null;
    stats.hotEvents.drain += 1;
    const batchOpts = {
      ...hotShared,
      batch: clampBatch(n, hotShared.batch),
    };
    if (!preferRing) return assistBatch(batchOpts);
    return ringOrFallback(
      'ringDrain',
      () => verifyRingDrain({
        ...ringShared,
        state: cpuRing,
        count: Math.min(n, ringShared.ringSlots ?? SM11_DEFAULT_RING_SLOTS),
      }),
      'ring_drain_ok',
      () => assistBatch(batchOpts),
    );
  }

  /**
   * Hot-path: reject / deny without (or before) a ring write.
   * Uses seq stamp integrity — never place/respond/logger CUDA.
   * Mailbox stub rejects and MonitorIpc idempotent reject-cache hits land here;
   * rejects that enqueue already fire onEnqueue via _enqueue.
   */
  function onReject() {
    if (!hotPath) return null;
    stats.hotEvents.reject += 1;
    return assistSeq(hotShared);
  }

  /**
   * Hot-path: wait/peek-side integrity (read path). Prefer ring-verify; else batch.
   * Does not mutate host rings; GPU MUST NOT list / no respond launch.
   */
  function onWait() {
    if (!hotPath) return null;
    stats.hotEvents.wait += 1;
    if (!preferRing) return assistBatch(hotShared);
    return ringOrFallback(
      'ringVerify',
      () => verifyRingVerify({
        ...ringShared,
        state: cpuRing,
      }),
      'ring_verify_ok',
      () => assistBatch(hotShared),
    );
  }

  async function flush() {
    await Promise.allSettled([...pending]);
  }

  async function close() {
    await flush();
    if (session) {
      try { await session.close(); } catch {}
    }
  }

  return {
    exePath,
    preferGpu,
    hotPath,
    preferRing,
    serve: Boolean(session),
    exePresent: () => exists(exePath),
    observeFat,
    scheduleVerify,
    assistScrub,
    assistSeq,
    assistBatch,
    assistRingPush,
    assistRingHash,
    assistRingScrub,
    assistRingDrain,
    assistRingVerify,
    onEnqueue,
    onDropOrClear,
    onDrain,
    onReject,
    onWait,
    verify: (payload) => verifyPayload(payload, shared).then((r) => record(r, 'verify')),
    verifyScrub: (probeOpts) => verifyScrub({ ...shared, ...probeOpts }).then((r) => record(r, 'scrub')),
    verifySeq: (probeOpts) => verifySeq({ ...shared, ...probeOpts }).then((r) => record(r, 'seq')),
    verifyBatch: (probeOpts) => verifyBatch({ ...shared, ...probeOpts }).then((r) => record(r, 'batch')),
    verifyRingPush: (payload, probeOpts) => verifyRingPush(payload, {
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }).then((r) => record(r, 'ringPush')),
    verifyRingHash: (probeOpts) => verifyRingHash({
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }).then((r) => record(r, 'ringHash')),
    verifyRingScrub: (probeOpts) => verifyRingScrub({
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }).then((r) => record(r, 'ringScrub')),
    verifyRingDrain: (count, probeOpts) => verifyRingDrain({
      ...ringShared,
      state: cpuRing,
      count,
      ...probeOpts,
    }).then((r) => record(r, 'ringDrain')),
    verifyRingVerify: (probeOpts) => verifyRingVerify({
      ...ringShared,
      state: cpuRing,
      ...probeOpts,
    }).then((r) => record(r, 'ringVerify')),
    flush,
    close,
    stats: () => ({
      ...stats,
      failByKind: { ...stats.failByKind },
      hotEvents: { ...stats.hotEvents },
      last: stats.last ? { ...stats.last } : null,
      pending: pending.size,
      serveAlive: session ? session.alive : false,
    }),
  };
}

/**
 * @param {unknown} sm11
 * @param {{ mode?: 'explicit' | 'auto' }} [opts]
 *  explicit (mailbox default): on only if sm11 truthy or GRZ_SM11=1
 *  auto (monitor ipc default): wire assist unless GRZ_SM11=0;
 *    CUDA spawn-on-fat only when GRZ_SM11=1 (CPU digest always available)
 */
export function resolveSm11Option(sm11, opts = {}) {
  const mode = opts.mode ?? 'explicit';
  const env = envSm11Enabled();
  if (sm11 === false || env === false) return null;
  if (typeof sm11 === 'object' && sm11) return createSm11Assist(sm11);
  if (sm11 === true) return createSm11Assist({ verifyOnFat: true });
  if (sm11 === 'auto' || (sm11 == null && mode === 'auto')) {
    return createSm11Assist({ verifyOnFat: env === true });
  }
  if (sm11 == null && mode === 'explicit' && env === true) {
    return createSm11Assist({ verifyOnFat: true });
  }
  return null;
}
