/**
 * sm_1.1 CUDA assist for mailbox/monitor hash + private-slot copy verify.
 * Spawns native/sm11-monitor/out/sm11_monitor.exe --json; CPU FNV-1a fallback.
 * Also exposes scrub / seq stamp / batch-hash probes (--scrub --seq --batch).
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

function buildCliArgs({ flags, batch, envBytes, payload }) {
  const args = ['--json', ...flags];
  if (batch != null) {
    args.push('--batch', String(clampBatch(batch)));
  }
  if (envBytes != null) {
    args.push('--env-bytes', String(clampEnvBytes(envBytes)));
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
  payload = SM11_PROBE_PAYLOAD,
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

  const args = buildCliArgs({ flags, batch, envBytes, payload });
  const ran = await runExe(exePath, args, { timeoutMs });
  const parsed = parseJsonLine(ran.stdout);
  if (!parsed || ran.code === 127 || ran.code === 124) {
    return { ...cpuResult(), fallback: ran.code === 124 ? 'timeout' : 'spawn_failed', stderr: ran.stderr };
  }
  const accepted = accept(parsed);
  if (accepted) {
    return { ...cudaBase(parsed), ...accepted };
  }
  return {
    ...cpuResult(),
    fallback: 'cuda_fail',
    cuda: parsed,
    stderr: ran.stderr,
  };
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

  const args = buildCliArgs({ flags, batch, envBytes, payload: asText });
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
  const runExe = opts.runExe ?? defaultRunExe;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const verifyOnFat = opts.verifyOnFat !== false;
  const shared = { exePath, preferGpu, timeoutMs, runExe, exists };

  const stats = {
    fat: 0,
    verifyAttempts: 0,
    scrub: 0,
    seq: 0,
    batch: 0,
    gpuOk: 0,
    cpuFallback: 0,
    fail: 0,
    last: null,
  };
  const pending = new Set();

  function record(result, kind = 'verify') {
    stats.verifyAttempts += 1;
    if (kind === 'scrub') stats.scrub += 1;
    if (kind === 'seq') stats.seq += 1;
    if (kind === 'batch') stats.batch += 1;
    stats.last = {
      backend: result.backend,
      ok: result.ok,
      fallback: result.fallback ?? null,
      hash: result.hash ?? null,
      kind,
      scrub_ok: result.scrub_ok,
      seq_ok: result.seq_ok,
      batch_ok: result.batch_ok,
    };
    if (result.backend === 'cuda' && result.ok) stats.gpuOk += 1;
    else if (result.fallback) stats.cpuFallback += 1;
    if (!result.ok) stats.fail += 1;
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

  function observeFat(text) {
    stats.fat += 1;
    const digest = digestFatPayload(text);
    if (verifyOnFat) scheduleVerify(text);
    return digest;
  }

  function scheduleVerify(payload) {
    return track(verifyPayload(payload, shared), 'verify');
  }

  /** Non-blocking scrub probe; CPU fallback when exe missing/fails. */
  function assistScrub(probeOpts = {}) {
    return track(verifyScrub({ ...shared, ...probeOpts }), 'scrub');
  }

  /** Non-blocking seq stamp verify; CPU fallback when exe missing/fails. */
  function assistSeq(probeOpts = {}) {
    return track(verifySeq({ ...shared, ...probeOpts }), 'seq');
  }

  /** Non-blocking batch envelope hash; CPU fallback when exe missing/fails. */
  function assistBatch(probeOpts = {}) {
    return track(verifyBatch({ ...shared, ...probeOpts }), 'batch');
  }

  async function flush() {
    await Promise.allSettled([...pending]);
  }

  return {
    exePath,
    preferGpu,
    exePresent: () => exists(exePath),
    observeFat,
    scheduleVerify,
    assistScrub,
    assistSeq,
    assistBatch,
    verify: (payload) => verifyPayload(payload, shared).then((r) => record(r, 'verify')),
    verifyScrub: (probeOpts) => verifyScrub({ ...shared, ...probeOpts }).then((r) => record(r, 'scrub')),
    verifySeq: (probeOpts) => verifySeq({ ...shared, ...probeOpts }).then((r) => record(r, 'seq')),
    verifyBatch: (probeOpts) => verifyBatch({ ...shared, ...probeOpts }).then((r) => record(r, 'batch')),
    flush,
    stats: () => ({ ...stats, last: stats.last ? { ...stats.last } : null, pending: pending.size }),
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
