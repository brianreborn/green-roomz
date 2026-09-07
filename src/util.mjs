import { createHash, timingSafeEqual } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function digestObject(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(filePath) {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

/** Strict ${VAR} allowlist for manifests (B14 / PF2). Percent-VAR is rejected (left literal). */
export const EXPAND_ENV_ALLOWLIST = Object.freeze(['GRZ_ROOT', 'GRZ_EXE', 'HOME', 'GRZ_LLAMA']);

export function expandEnvironment(value, env = process.env) {
  if (typeof value === 'string') {
    // Case-sensitive: ${grz_root} does not match. Unknown keys stay literal (no prototype bleed).
    return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (match, key) => {
      if (!EXPAND_ENV_ALLOWLIST.includes(key)) return match;
      if (!Object.hasOwn(env, key)) return '';
      const raw = env[key];
      return raw == null ? '' : String(raw);
    });
  }
  if (Array.isArray(value)) return value.map((item) => expandEnvironment(item, env));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandEnvironment(item, env)]));
  }
  return value;
}

/** Darwin path compare / open: NFC-normalize. No-op elsewhere. */
export function nfcPath(value) {
  if (value == null) return value;
  const s = String(value);
  if (process.platform !== 'darwin') return s;
  return s.normalize('NFC');
}

export function resolveManifestPath(manifestPath, candidate) {
  if (!candidate) return candidate;
  if (path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\')) return candidate;
  return path.resolve(path.dirname(manifestPath), '..', candidate);
}

export function secureEquals(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
    }, { once: true });
  });
}

/**
 * Combine a caller abort signal with a hard timeout. Returns a single signal
 * that aborts when either fires. `deadlineMs` <= 0 disables the timeout.
 */
export function deadlineSignal(signal, deadlineMs) {
  if (!deadlineMs || deadlineMs <= 0) return signal ?? undefined;
  const timed = AbortSignal.timeout(deadlineMs);
  return signal ? AbortSignal.any([signal, timed]) : timed;
}

/** True when this rejection is a timeout we imposed, not a caller cancellation. */
export function isTimeoutAbort(error, callerSignal) {
  if (callerSignal?.aborted) return false;
  return error?.name === 'TimeoutError'
    || error?.cause?.name === 'TimeoutError'
    || (error?.name === 'AbortError' && !callerSignal);
}

/**
 * Read an upstream Response body as text with a hard byte cap, streaming when a
 * ReadableStream body is available so a giant/never-ending response can't be
 * buffered whole. Falls back to .text()/.json() for stub responses in tests.
 */
export async function readCappedText(upstream, maxBytes) {
  const body = upstream?.body;
  if (body && typeof body.getReader === 'function' && maxBytes > 0) {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          const err = new Error('upstream response exceeds buffer cap');
          err.code = 'UPSTREAM_TOO_LARGE';
          throw err;
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  if (typeof upstream?.text === 'function') return upstream.text();
  return JSON.stringify(await upstream.json());
}

export function jitteredBackoff(attempt, initialMs, maximumMs, random = Math.random) {
  const ceiling = Math.min(maximumMs, initialMs * 2 ** attempt);
  return Math.max(1, Math.round(ceiling * (0.5 + random() * 0.5)));
}

export function redact(value) {
  const text = String(value ?? '');
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/data:(image|audio)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:$1/[REDACTED]')
    .replace(/("?(?:api[_-]?key|authorization)"?\s*[:=]\s*)"?[^",\s]+"?/gi, '$1[REDACTED]');
}

const C0_C1 = /[\u0000-\u001F\u007F-\u009F]/g;
const CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC = /\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g;
const LS_PS = /[\u2028\u2029]/g;
const BIDI_ISOLATES = /[\u2066-\u2069]/g;

export function stripControls(value) {
  return String(value ?? '').replace(C0_C1, ' ').replace(LS_PS, ' ').replace(BIDI_ISOLATES, '').replace(/[ \t]{2,}/g, ' ').trim();
}

export function stripEscapes(value) {
  return String(value ?? '')
    .replace(OSC, '')
    .replace(CSI, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(LS_PS, '')
    .replace(BIDI_ISOLATES, '');
}

export function headerSafe(value, maxBytes = 240) {
  const cleaned = stripControls(value);
  const buf = Buffer.from(cleaned, 'utf8');
  if (buf.length <= maxBytes) return cleaned;
  return buf.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD$/, '');
}

export function jsonResponse(response, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    ...headers,
  });
  response.end(data);
}
