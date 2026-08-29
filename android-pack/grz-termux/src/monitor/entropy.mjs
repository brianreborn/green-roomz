/**
 * Fortuna-style entropy core stub. CPU only.
 * NOT on the 8600. NOT Yarrow. NOT a CUDA launch.
 *
 * Mix locally. Mailbox carries credit/hash, NEVER raw bits.
 * Named sources: irq timing, nic timestamps, gpu seq jitter, voluntary feed.
 * MUST NOT read worker packet payloads.
 * After first seed, never block. Unseeded only delays enroll ({ready:false}).
 * MUST NOT secure_reboot for entropy starvation (no respond calls).
 * Seed lives in-memory (or empty). Not in the git tree. Not a cloned disk image.
 *
 * Medium: credit/hash API. Full Fortuna paper mixer is complex-last.
 */

import { createHash } from 'node:crypto';
import { makeEnvelope } from './api.mjs';

export const ENTROPY_CALLS = Object.freeze(['credit', 'hash']);

/** Named sources only. Values are labels, not hardware readers. */
export const SOURCES = Object.freeze([
  'irq_timing',
  'nic_timestamps',
  'gpu_seq_jitter',
  'voluntary_feed',
]);

export const CORE = Object.freeze({
  mixer: 'fortuna',
  cpu: true,
  gpu: false,
  on8600: false,
  yarrow: false,
  cudaLaunch: false,
  cuda: false,
  device: 'cpu',
});

const SOURCE_ALIASES = Object.freeze({
  irq: 'irq_timing',
  irq_timing: 'irq_timing',
  'irq timing': 'irq_timing',
  nic: 'nic_timestamps',
  nic_timestamps: 'nic_timestamps',
  'nic timestamps': 'nic_timestamps',
  gpu: 'gpu_seq_jitter',
  gpu_seq_jitter: 'gpu_seq_jitter',
  'gpu seq jitter': 'gpu_seq_jitter',
  voluntary: 'voluntary_feed',
  voluntary_feed: 'voluntary_feed',
  'voluntary feed': 'voluntary_feed',
});

const RAW_KEYS = new Set([
  'bits', 'raw', 'rawbits', 'raw_bits', 'rawBits',
  'seed', 'seedmaterial', 'seed_material', 'seedMaterial',
  'entropy_bits', 'entropybits', 'bytes', 'buffer',
]);

const PACKET_KEYS = new Set([
  'packet', 'packets', 'frame', 'frames', 'datagram', 'skb',
  'workerpayload', 'worker_payload', 'workerPayload',
]);

const RESPOND_VERBS = new Set(['lockdown', 'reboot', 'secure_reboot']);

function neverInvokeRespond(respond) {
  if (!respond || typeof respond !== 'object') return;
  // v1: entropy never raises respond. Spies exist so tests can prove we skip them.
}

function payloadOf(partial) {
  return partial && typeof partial === 'object' && partial.payload && typeof partial.payload === 'object'
    ? partial.payload
    : {};
}

function normalizeSource(name) {
  const raw = String(name ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const spaced = String(name ?? '').trim().toLowerCase();
  return SOURCE_ALIASES[raw] ?? SOURCE_ALIASES[spaced] ?? (SOURCES.includes(raw) ? raw : 'voluntary_feed');
}

function isPacketKey(name) {
  const n = String(name ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  return PACKET_KEYS.has(n) || PACKET_KEYS.has(String(name ?? ''));
}

function isRawKey(name) {
  const n = String(name ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  return RAW_KEYS.has(n) || RAW_KEYS.has(String(name ?? ''));
}

function toBytes(value) {
  if (value == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (typeof value === 'number' && Number.isFinite(value)) {
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(value);
    return buf;
  }
  if (typeof value === 'bigint') return Buffer.from(value.toString(16), 'utf8');
  return Buffer.from(String(value), 'utf8');
}

function hashedBytes(value) {
  return createHash('sha256').update(toBytes(value)).digest();
}

/**
 * Collect mix-in material. Named sample/credit/feed only.
 * Worker packet payloads are skipped (not read). Raw bits are hashed then dropped.
 */
function mixIns(partial, inner, source) {
  const pieces = [];
  const creditAmt = Number.isFinite(partial.credit)
    ? Number(partial.credit)
    : Number.isFinite(inner.credit)
      ? Number(inner.credit)
      : 1;
  pieces.push(Buffer.from(String(creditAmt), 'utf8'));

  const sample = partial.sample ?? inner.sample
    ?? partial.tsDelta ?? inner.tsDelta
    ?? partial.jitter ?? inner.jitter;
  if (sample != null && typeof sample !== 'object') {
    pieces.push(toBytes(sample));
  }

  if (source === 'voluntary_feed') {
    const feed = partial.feed ?? inner.feed;
    if (feed != null && typeof feed !== 'object') {
      pieces.push(hashedBytes(feed));
    }
  }

  for (const obj of [partial, inner]) {
    if (!obj || typeof obj !== 'object') continue;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'payload') continue;
      if (isPacketKey(k)) continue;
      if (isRawKey(k) && v != null) {
        pieces.push(hashedBytes(v));
      }
    }
  }

  return { pieces, creditAmt };
}

function publicPayload(source, creditAmt, hex) {
  return { source, credit: creditAmt, hash: hex };
}

/**
 * One in-memory Fortuna-style accumulator. Empty until first credit.
 * Not a 32-pool paper mixer (complex-last).
 */
export function createEntropy(options = {}) {
  const respond = options.respond;
  neverInvokeRespond(respond);

  let pool = null;
  let seeded = false;

  function mix(source, pieces) {
    const h = createHash('sha256');
    if (pool) h.update(pool);
    h.update(String(source), 'utf8');
    for (const p of pieces) {
      if (p && p.length) h.update(p);
    }
    pool = h.digest();
    seeded = true;
    return pool.toString('hex');
  }

  function denyRespond(partial, opts) {
    const call = opts.call ?? partial.call;
    if (RESPOND_VERBS.has(String(call ?? ''))) {
      neverInvokeRespond(respond);
    }
  }

  /**
   * Credit a named source. Mix locally. Return a credit envelope whose
   * payload is {source, credit, hash} — never raw bits, never packets.
   */
  function credit(partial = {}, opts = {}) {
    neverInvokeRespond(respond);
    denyRespond(partial, opts);

    const body = partial && typeof partial === 'object' ? partial : {};
    const inner = payloadOf(body);
    const source = normalizeSource(body.source ?? inner.source ?? opts.source);
    const { pieces, creditAmt } = mixIns(body, inner, source);
    const hex = mix(source, pieces);

    return makeEnvelope({
      seq: body.seq,
      kind: 'credit',
      source: String(body.producer ?? opts.producer ?? 'entropy'),
      ticket: body.ticket,
      ts: body.ts,
      target: body.target ?? 'machine',
      payload: publicPayload(source, creditAmt, hex),
    });
  }

  /**
   * Current pool hash. Unseeded: {ready:false} — delays enroll, never throws,
   * never secure_reboot. After first seed this is always sync / non-blocking.
   */
  function hash(partial = {}, opts = {}) {
    neverInvokeRespond(respond);
    denyRespond(partial && typeof partial === 'object' ? partial : {}, opts);
    if (!seeded || !pool) {
      return { ready: false };
    }
    return { ready: true, hash: pool.toString('hex') };
  }

  /** Unseeded delays enroll. MUST NOT secure_reboot for starvation. */
  function enroll(partial = {}, opts = {}) {
    neverInvokeRespond(respond);
    denyRespond(partial && typeof partial === 'object' ? partial : {}, opts);
    if (!seeded || !pool) {
      return { ready: false };
    }
    return { ready: true, hash: pool.toString('hex') };
  }

  return Object.freeze({ credit, hash, enroll });
}

const defaults = createEntropy();
export const credit = defaults.credit;
export const hash = defaults.hash;
export const enroll = defaults.enroll;
