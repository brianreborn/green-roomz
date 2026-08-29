/**
 * Dedicated append-only hash-chained audit sink.
 * NOT the 256-slot hot ring. Calls: emit, read.
 * No lockdown / reboot / secure_reboot rights.
 * Fail-open: disk full or write failure DROPs the record and returns.
 * No retry-storm, no busy loop, no sync fsync. Flood must not block IPC push.
 * Chain: each record hashes previous hash + payload into opaque hex (v1).
 * Never stores passwords / tokens / keys. Never invokes respond verbs.
 */

import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import {
  assertCaller,
  makeEnvelope,
  u64,
  u64Inc,
} from './api.mjs';

const GENESIS = '0'.repeat(64);
const MAX_IN_FLIGHT = 4;
const FAT_STRING = 256;

const SECRET_KEYS = new Set([
  'password', 'passwords', 'passwd',
  'token', 'tokens', 'bearer',
  'cookie', 'cookies',
  'key', 'keys', 'privatekey', 'private_key', 'apikey', 'api_key',
  'secret', 'secrets',
  'authorization', 'credential', 'credentials', 'auth',
]);

const RESPOND_VERBS = new Set(['lockdown', 'reboot', 'secure_reboot']);

function isSecretKey(name) {
  const n = String(name ?? '').toLowerCase();
  if (SECRET_KEYS.has(n)) return true;
  if (n.includes('password') || n.includes('token') || n.includes('cookie')) return true;
  if (n.endsWith('key') && n !== 'rightsmask') return true;
  return false;
}

function omitSecrets(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(omitSecrets);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSecretKey(k)) continue;
    out[k] = omitSecrets(v);
  }
  return out;
}

function canonicalize(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

function opaqueHex(prev, payload) {
  return createHash('sha256')
    .update(String(prev ?? GENESIS), 'utf8')
    .update(canonicalize(payload), 'utf8')
    .digest('hex');
}

function normalizeLoggedPayload(payload) {
  if (typeof payload === 'string' && payload.length > FAT_STRING) {
    return createHash('sha256').update(payload).digest('hex');
  }
  return omitSecrets(payload == null ? {} : payload);
}

/** SAD is a monitor slice; emit callers are IPC and any monitor. */
function emitRole(role) {
  const r = String(role ?? 'monitor');
  if (r === 'sad') return 'monitor';
  return r;
}

function defaultWrite(path) {
  if (!path) return () => undefined;
  return (record) => appendFile(path, `${JSON.stringify(record)}\n`);
}

/**
 * Verify prev-link + opaque payload hash. Algorithm is not a public SHALL.
 */
export function verifyChain(records, genesis = GENESIS) {
  if (!Array.isArray(records)) return false;
  let prev = genesis;
  for (const rec of records) {
    if (!rec || typeof rec.hash !== 'string' || rec.hash.length === 0) return false;
    if (String(rec.prev ?? '') !== prev) return false;
    if (opaqueHex(prev, rec.payload) !== rec.hash) return false;
    prev = rec.hash;
  }
  return true;
}

export function createLogger(options = {}) {
  const write = typeof options.write === 'function'
    ? options.write
    : typeof options.writer === 'function'
      ? options.writer
      : defaultWrite(options.path);
  const chain = [];
  let prev = GENESIS;
  let seq = u64(0, 0);
  let inFlight = 0;
  let tail = Promise.resolve();

  async function emit(partial = {}, opts = {}) {
    const callerRole = opts.callerRole ?? 'monitor';
    const call = opts.call;
    if (RESPOND_VERBS.has(String(call ?? ''))) {
      assertCaller(call, callerRole);
    }
    assertCaller('emit', emitRole(callerRole));

    if (inFlight >= MAX_IN_FLIGHT) {
      return { ok: true, dropped: true };
    }
    inFlight += 1;

    const run = async () => {
      const payload = normalizeLoggedPayload(partial.payload ?? {});
      const nextSeq = u64Inc(seq);
      const envelope = makeEnvelope({
        seq: nextSeq,
        kind: partial.kind ?? 'observe',
        source: partial.source ?? callerRole,
        ticket: partial.ticket,
        ts: partial.ts,
        payload,
        target: partial.target,
      });
      const record = Object.freeze({
        seq: envelope.seq,
        kind: envelope.kind,
        source: envelope.source,
        ticket: envelope.ticket,
        ts: envelope.ts,
        payload: envelope.payload,
        target: envelope.target,
        prev,
        hash: opaqueHex(prev, payload),
      });
      await write(record);
      seq = nextSeq;
      prev = record.hash;
      chain.push(record);
      return { ok: true, dropped: false, hash: record.hash };
    };

    const mine = tail.then(run, run);
    tail = mine.then(() => undefined, () => undefined);
    try {
      return await mine;
    } catch {
      return { ok: true, dropped: true };
    } finally {
      inFlight -= 1;
    }
  }

  function read(opts = {}) {
    if (opts.callerRole) assertCaller('read', opts.callerRole);
    return chain.map((rec) => ({
      ...rec,
      seq: { ...rec.seq },
      ticket: { ...rec.ticket },
      payload: rec.payload && typeof rec.payload === 'object' && !Array.isArray(rec.payload)
        ? { ...rec.payload }
        : rec.payload,
    }));
  }

  return Object.freeze({ emit, read });
}
