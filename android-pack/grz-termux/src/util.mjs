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

export function expandEnvironment(value, env = process.env) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, key) => env[key] ?? '');
  }
  if (Array.isArray(value)) return value.map((item) => expandEnvironment(item, env));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandEnvironment(item, env)]));
  }
  return value;
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

export function stripControls(value) {
  return String(value ?? '').replace(C0_C1, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

export function stripEscapes(value) {
  return String(value ?? '')
    .replace(OSC, '')
    .replace(CSI, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

export function headerSafe(value) {
  return stripControls(value).slice(0, 240);
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
