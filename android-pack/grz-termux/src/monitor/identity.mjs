/**
 * Identity snapshot schema + builders. No passwords/tokens/cookies/keys.
 * Same ticket MUST yield the same snapshot (idempotent, no extra side effects).
 */

import { normalizeU64, u64, u64Key } from './ids.mjs';

export const IDENTITY_FIELDS = Object.freeze([
  'pid',
  'tid',
  'createTime',
  'bootId',
  'parentPid',
  'parentStart',
  'jail',
  'auid',
  'euid',
  'vnodeGen',
  'monotonic',
  'wall',
  'ringCpl',
  'rightsMask',
]);

const SECRET_KEYS = new Set([
  'password', 'passwords', 'passwd',
  'token', 'tokens', 'bearer',
  'cookie', 'cookies',
  'key', 'keys', 'privatekey', 'private_key', 'apikey', 'api_key',
  'secret', 'secrets',
  'authorization', 'credential', 'credentials', 'auth',
]);

const snapshotsByTicket = new Map();

function isSecretKey(name) {
  const n = String(name ?? '').toLowerCase();
  if (SECRET_KEYS.has(n)) return true;
  if (n.includes('password') || n.includes('token') || n.includes('cookie')) return true;
  if (n.endsWith('key') && n !== 'rightsMask'.toLowerCase()) return true;
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

function fillDefaults(partial = {}) {
  const src = omitSecrets(partial);
  const snap = {
    pid: Number.isFinite(src.pid) ? Number(src.pid) : 0,
    tid: Number.isFinite(src.tid) ? Number(src.tid) : 0,
    createTime: Number.isFinite(src.createTime) ? Number(src.createTime) : 0,
    bootId: src.bootId != null ? normalizeU64(src.bootId) : u64(0, 0),
    parentPid: Number.isFinite(src.parentPid) ? Number(src.parentPid) : 0,
    parentStart: Number.isFinite(src.parentStart) ? Number(src.parentStart) : 0,
    jail: src.jail == null ? '' : String(src.jail),
    auid: Number.isFinite(src.auid) ? Number(src.auid) : -1,
    euid: Number.isFinite(src.euid) ? Number(src.euid) : -1,
    monotonic: Number.isFinite(src.monotonic) ? Number(src.monotonic) : 0,
    wall: Number.isFinite(src.wall) ? Number(src.wall) : 0,
    ringCpl: src.ringCpl == null || src.ringCpl === '' ? 'user' : String(src.ringCpl),
    rightsMask: Number.isFinite(src.rightsMask) ? Number(src.rightsMask) : 0,
  };
  if (src.vnodeGen != null) snap.vnodeGen = src.vnodeGen;
  return snap;
}

/**
 * Build an identity snapshot. Unknown / secret keys are dropped.
 * Repeated calls with the same ticket return the first snapshot.
 */
export function snapshotIdentity(partial = {}) {
  const ticket = normalizeU64(partial.ticket);
  const key = u64Key(ticket);
  const existing = snapshotsByTicket.get(key);
  if (existing) return existing;
  const snap = fillDefaults(partial);
  snapshotsByTicket.set(key, snap);
  return snap;
}
