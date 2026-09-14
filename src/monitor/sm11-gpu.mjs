/**
 * sm_1.1 CUDA assist for mailbox/monitor hash + private-slot copy verify.
 * Spawns native/sm11-monitor/out/sm11_monitor.exe --json; CPU FNV-1a fallback.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const FNV_OFFSET = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;
const FAT_LIMIT = 256;
const SM11_MAX_BYTES = 4096;

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

  const args = ['--json', ...flags, asText];
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

export async function probeSm11(options = {}) {
  return verifyPayload(options.payload ?? 'green-roomz-mailbox-probe', {
    ...options,
    flags: options.flags ?? ['--copy', '--hash', '--scrub', '--seq'],
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

  const stats = {
    fat: 0,
    verifyAttempts: 0,
    gpuOk: 0,
    cpuFallback: 0,
    fail: 0,
    last: null,
  };
  const pending = new Set();

  function record(result) {
    stats.verifyAttempts += 1;
    stats.last = {
      backend: result.backend,
      ok: result.ok,
      fallback: result.fallback ?? null,
      hash: result.hash ?? null,
    };
    if (result.backend === 'cuda' && result.ok) stats.gpuOk += 1;
    else if (result.fallback) stats.cpuFallback += 1;
    if (!result.ok) stats.fail += 1;
    return result;
  }

  function observeFat(text) {
    stats.fat += 1;
    const digest = digestFatPayload(text);
    if (verifyOnFat) scheduleVerify(text);
    return digest;
  }

  function scheduleVerify(payload) {
    const p = verifyPayload(payload, { exePath, preferGpu, timeoutMs, runExe, exists })
      .then(record)
      .catch((error) => record({
        ok: false,
        backend: 'cpu',
        fallback: 'error',
        error: String(error?.message ?? error),
      }))
      .finally(() => { pending.delete(p); });
    pending.add(p);
    return p;
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
    verify: (payload) => verifyPayload(payload, { exePath, preferGpu, timeoutMs, runExe, exists }).then(record),
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
