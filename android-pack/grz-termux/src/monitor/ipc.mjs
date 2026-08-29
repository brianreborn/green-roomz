/**
 * Security-monitor IPC: copy-only mailbox rings.
 *
 * MUST: two queues, push non-blocking, drain broadcast (listeners do not steal).
 * MUST NOT: mapped pinned host ring, SharedArrayBuffer, common heap, 64-bit atomics.
 * seq is logical 64-bit {hi,lo}; 32-bit ring index is occupancy, not identity.
 * ticket accepts live string session ids AND {hi,lo}.
 *
 * vote / lockdown / reboot / secure_reboot stay uncallable stubs (throw).
 * Missing capability bit => reject envelope, never silent no-op.
 */

import { createHash } from 'node:crypto';
import {
  HOT_RING_SLOTS,
  UPCALL_SLOTS,
  KINDS,
  ENVELOPE_FIELDS,
  makeEnvelope,
  makeUpcall,
  makeReject,
  peekReject,
  normalizeU64,
  u64,
  u64Inc,
  u64Eq,
  u64Key,
  ringIndex32,
  hashStringToU64,
  callerDeniedReason,
  isAllowlistedOp,
  vote as apiVote,
  secureReboot as apiSecureReboot,
} from './api.mjs';

export {
  HOT_RING_SLOTS,
  UPCALL_SLOTS,
  KINDS,
  ENVELOPE_FIELDS,
  u64,
  u64Eq,
  u64Inc,
  ringIndex32,
  makeEnvelope,
  makeReject,
};

export const HOP_CLASS_KINDS = Object.freeze([
  'hop',
  'success',
  'agent_unavailable',
  'route_exhausted',
]);

export const STUB_CALLS = Object.freeze(['vote', 'lockdown', 'reboot', 'secure_reboot']);

export const CAP = Object.freeze({
  POST: 1 << 0,
  WAIT: 1 << 1,
  REPLY: 1 << 2,
  UPCALL: 1 << 3,
  OBSERVE: 1 << 4,
  SNAPSHOT: 1 << 5,
  GRADE: 1 << 6,
  CREDIT: 1 << 7,
  VOTE: 1 << 8,
  LOCKDOWN: 1 << 9,
  REBOOT: 1 << 10,
  SECURE_REBOOT: 1 << 11,
});

export const CAP_ALL = (
  CAP.POST | CAP.WAIT | CAP.REPLY | CAP.UPCALL | CAP.OBSERVE | CAP.SNAPSHOT
  | CAP.GRADE | CAP.CREDIT | CAP.VOTE | CAP.LOCKDOWN | CAP.REBOOT | CAP.SECURE_REBOOT
) >>> 0;

/** Default mask: everything except respond/vote stubs. */
export const CAP_DEFAULT = (CAP_ALL & ~(CAP.VOTE | CAP.LOCKDOWN | CAP.REBOOT | CAP.SECURE_REBOOT)) >>> 0;

const KIND_CAP = Object.freeze({
  hop: CAP.POST,
  success: CAP.POST,
  agent_unavailable: CAP.POST,
  route_exhausted: CAP.POST,
  upcall: CAP.UPCALL,
  reply: CAP.REPLY,
  reject: CAP.POST,
  grade: CAP.GRADE,
  vote: CAP.VOTE,
  credit: CAP.CREDIT,
  snapshot: CAP.SNAPSHOT,
  observe: CAP.OBSERVE,
});

const STUB_KIND_REASON = Object.freeze({
  vote: 'vote is uncallable (complex-last; no 3-replica quorum)',
  lockdown: 'lockdown is uncallable (complex-last)',
  reboot: 'reboot is uncallable (complex-last)',
  secure_reboot: 'secure_reboot is uncallable (complex-last)',
});

export function isHopClass(kind) {
  return HOP_CLASS_KINDS.includes(String(kind ?? ''));
}

export function isU64Like(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && 'hi' in value && 'lo' in value;
}

export function hasCap(mask, bit) {
  const m = (mask >>> 0);
  const b = (bit >>> 0);
  if (b === 0) return true;
  return (m & b) === b;
}

export function acceptTicket(ticket) {
  if (ticket == null || ticket === '') return '';
  if (isU64Like(ticket)) return u64(ticket.hi, ticket.lo);
  if (typeof ticket === 'number' && Number.isFinite(ticket)) return normalizeU64(ticket);
  return String(ticket);
}

export function ticketKey(ticket) {
  if (isU64Like(ticket)) return `u:${u64Key(ticket)}`;
  if (typeof ticket === 'string') return `s:${ticket}`;
  if (typeof ticket === 'number' && Number.isFinite(ticket)) return `u:${u64Key(normalizeU64(ticket))}`;
  return `s:${String(ticket ?? '')}`;
}

export function ticketsMatch(a, b) {
  if (a === b) return true;
  if (isU64Like(a) && isU64Like(b)) return u64Eq(a, b);
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  const ua = isU64Like(a) ? a : hashStringToU64(a);
  const ub = isU64Like(b) ? b : hashStringToU64(b);
  return u64Eq(ua, ub);
}

function cloneId(id) {
  if (isU64Like(id)) return u64(id.hi, id.lo);
  return id;
}

function clonePayload(payload) {
  if (payload == null) return {};
  if (typeof payload === 'string') {
    if (payload.length <= 256) return payload;
    return createHash('sha256').update(payload).digest('hex');
  }
  if (typeof payload === 'object' && !Array.isArray(payload)) return { ...payload };
  return payload;
}

export function cloneEnvelope(env) {
  if (!env || typeof env !== 'object') return env;
  const out = {
    seq: cloneId(env.seq),
    kind: env.kind,
    source: env.source,
    ticket: cloneId(env.ticket),
    ts: env.ts,
    payload: clonePayload(env.payload),
    target: env.target,
  };
  for (const extra of ['allowlisted', 'from', 'to', 'reason', 'voted']) {
    if (extra in env) out[extra] = env[extra];
  }
  return out;
}

function seqCmp(a, b) {
  const x = normalizeU64(a);
  const y = normalizeU64(b);
  if (x.hi !== y.hi) return x.hi > y.hi ? 1 : -1;
  if (x.lo !== y.lo) return x.lo > y.lo ? 1 : -1;
  return 0;
}

/**
 * Copy-only occupancy ring. Slots hold JS copies. Index is 32-bit (head/tail & mask).
 * NOT a mapped host buffer and NOT seq-identity.
 */
class CopyRing {
  constructor(slots) {
    this.capacity = slots >>> 0;
    this.mask = (slots - 1) >>> 0;
    this.slots = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.dropped = 0;
    this.pushed = 0;
  }

  pushCopy(envelope) {
    if (this.size === this.capacity) {
      this.slots[this.tail] = undefined;
      this.tail = (this.tail + 1) & this.mask;
      this.size -= 1;
      this.dropped += 1;
    }
    this.slots[this.head] = cloneEnvelope(envelope);
    this.head = (this.head + 1) & this.mask;
    this.size += 1;
    this.pushed += 1;
  }

  peekCopies() {
    const out = [];
    let i = this.tail;
    for (let n = 0; n < this.size; n += 1) {
      out.push(cloneEnvelope(this.slots[i]));
      i = (i + 1) & this.mask;
    }
    return out;
  }

  drainCopies() {
    const out = this.peekCopies();
    let i = this.tail;
    for (let n = 0; n < this.size; n += 1) {
      this.slots[i] = undefined;
      i = (i + 1) & this.mask;
    }
    this.tail = this.head;
    this.size = 0;
    return out;
  }
}

function kindCapBit(kind) {
  const k = String(kind ?? '');
  if (k in KIND_CAP) return KIND_CAP[k];
  return null;
}

export class MonitorIpc {
  constructor({
    onEvent,
    autoDrain = true,
    rightsMask = CAP_DEFAULT,
    role = 'ipc',
    seq = null,
    recentLimit = 64,
  } = {}) {
    this.hot = new CopyRing(HOT_RING_SLOTS);
    this.upcalls = new CopyRing(UPCALL_SLOTS);
    this.seq = seq == null ? u64(0, 0) : normalizeU64(seq);
    this.rightsMask = rightsMask >>> 0;
    this.role = String(role ?? 'ipc');
    this.autoDrain = autoDrain !== false;
    this.listeners = [];
    if (typeof onEvent === 'function') this.listeners.push(onEvent);
    this.recentLimit = Math.max(1, Number(recentLimit) || 64);
    this.recentBuf = [];
    this.byTicket = new Map();
    this._drainScheduled = false;
    this.copyOnly = true;
    this.mappedPinnedHostRing = false;
    this.sharedMapping = null;
  }

  onEvent(fn) {
    if (typeof fn !== 'function') return () => {};
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== fn);
    };
  }

  stats() {
    return {
      copyOnly: true,
      mappedPinnedHostRing: false,
      seq: u64(this.seq.hi, this.seq.lo),
      listeners: this.listeners.length,
      hot: {
        capacity: this.hot.capacity,
        size: this.hot.size,
        pushed: this.hot.pushed,
        dropped: this.hot.dropped,
      },
      upcalls: {
        capacity: this.upcalls.capacity,
        size: this.upcalls.size,
        pushed: this.upcalls.pushed,
        dropped: this.upcalls.dropped,
      },
    };
  }

  peekHot() {
    return this.hot.peekCopies();
  }

  peekUpcalls() {
    return this.upcalls.peekCopies();
  }

  peek() {
    return [...this.hot.peekCopies(), ...this.upcalls.peekCopies()].sort((a, b) => seqCmp(a.seq, b.seq));
  }

  recent(limit = this.recentLimit) {
    const requested = Number(limit);
    const n = Math.max(0, Math.min(this.recentBuf.length, Number.isFinite(requested) ? requested : this.recentLimit));
    if (n === 0) return [];
    return this.recentBuf.slice(-n).map((event) => cloneEnvelope(event));
  }

  vote() {
    apiVote();
  }

  lockdown() {
    throw new Error('complex-last');
  }

  reboot() {
    throw new Error('complex-last');
  }

  secureReboot() {
    apiSecureReboot();
  }

  secure_reboot() {
    this.secureReboot();
  }

  push(partial = {}, opts = {}) {
    const rights = opts.rightsMask == null ? this.rightsMask : (opts.rightsMask >>> 0);
    const role = opts.role == null ? this.role : String(opts.role);
    const kind = String(partial.kind ?? '');
    const ticket = acceptTicket(partial.ticket);

    const stubReason = STUB_KIND_REASON[kind];
    const bit = kindCapBit(kind);
    if (bit == null || kind === '') {
      return this._reject({
        ticket,
        source: partial.source ?? 'ipc',
        target: partial.target,
        reason: kind === '' ? 'missing kind' : `unknown kind ${kind}`,
        from: 'ipc',
        to: kind || 'push',
      });
    }
    if (!hasCap(rights, bit)) {
      return this._reject({
        ticket,
        source: partial.source ?? 'ipc',
        target: partial.target,
        reason: `missing capability bit for ${kind}`,
        from: role,
        to: kind,
      });
    }
    if (stubReason) {
      return this._reject({
        ticket,
        source: partial.source ?? 'ipc',
        target: partial.target,
        reason: stubReason,
        from: role,
        to: kind,
      });
    }

    let envelope;
    if (kind === 'upcall') {
      envelope = makeUpcall({
        ...partial,
        kind: 'upcall',
        ticket: isU64Like(ticket) ? ticket : 0,
      });
      envelope.ticket = ticket;
      if (!isAllowlistedOp(envelope.payload?.op) || envelope.allowlisted === false) {
        return this._reject({
          ticket,
          source: partial.source ?? envelope.source ?? 'ipc',
          target: envelope.target,
          reason: `op not allowlisted: ${envelope.payload?.op ?? ''}`,
          from: role,
          to: 'upcall',
        });
      }
    } else {
      envelope = makeEnvelope({
        ...partial,
        kind,
        ticket: isU64Like(ticket) ? ticket : 0,
        payload: clonePayload(partial.payload),
      });
      envelope.ticket = ticket;
    }

    const queued = this._enqueue(envelope);
    return { ok: true, seq: cloneId(queued.seq), dropped: this._dropped(), size: this._size() };
  }

  post(partial = {}, opts = {}) {
    const denied = this._denyCall('post', CAP.POST, opts, partial);
    if (denied) return denied;
    const kind = String(partial.kind ?? 'hop');
    return this.push({ ...partial, kind }, opts);
  }

  wait(ticket, opts = {}) {
    const partial = { ticket, source: opts.source ?? 'ipc', target: opts.target };
    const denied = this._denyCall('wait', CAP.WAIT, opts, partial);
    if (denied) return denied;
    const events = this._copiesForTicket(acceptTicket(ticket));
    return { ok: true, events };
  }

  reply(partial = {}, opts = {}) {
    const denied = this._denyCall('reply', CAP.REPLY, opts, partial);
    if (denied) return denied;
    return this.push({ ...partial, kind: 'reply' }, opts);
  }

  observeHop(kind, source, extra = {}, opts = {}) {
    return this.push({
      kind: kind || 'hop',
      source: source ?? '',
      ticket: extra.ticket ?? '',
      payload: extra.payload ?? {},
      target: extra.target,
    }, opts);
  }

  drain(callback) {
    const listeners = typeof callback === 'function' ? [callback, ...this.listeners] : this.listeners.slice();
    const events = [...this.hot.drainCopies(), ...this.upcalls.drainCopies()]
      .sort((a, b) => seqCmp(a.seq, b.seq));
    for (const event of events) {
      for (const listener of listeners) {
        try { listener(cloneEnvelope(event)); } catch {}
      }
    }
    return events;
  }

  _size() {
    return this.hot.size + this.upcalls.size;
  }

  _dropped() {
    return this.hot.dropped + this.upcalls.dropped;
  }

  _denyCall(call, bit, opts, partial = {}) {
    const rights = opts.rightsMask == null ? this.rightsMask : (opts.rightsMask >>> 0);
    const role = opts.role == null ? this.role : String(opts.role);
    const ticket = acceptTicket(partial.ticket ?? opts.ticket);
    if (!hasCap(rights, bit)) {
      return this._reject({
        ticket,
        source: partial.source ?? 'ipc',
        target: partial.target,
        reason: `missing capability bit for ${call}`,
        from: role,
        to: call,
      });
    }
    const reason = callerDeniedReason(call, role);
    if (reason) {
      return this._reject({
        ticket,
        source: partial.source ?? 'ipc',
        target: partial.target,
        reason,
        from: role,
        to: call,
      });
    }
    return null;
  }

  _reject(partial) {
    const accepted = acceptTicket(partial.ticket);
    const cacheTicket = isU64Like(accepted) ? accepted : hashStringToU64(accepted);
    const existing = peekReject(cacheTicket);
    if (existing) {
      const copy = cloneEnvelope(existing);
      copy.ticket = accepted;
      return { ok: false, reject: copy };
    }
    const reject = makeReject({
      ticket: cacheTicket,
      from: partial.from,
      to: partial.to,
      reason: String(partial.reason ?? 'rejected'),
      source: String(partial.source ?? 'ipc'),
      target: partial.target ?? 'machine',
    });
    reject.ticket = accepted;
    const queued = this._enqueue(reject);
    return { ok: false, reject: cloneEnvelope(queued) };
  }

  _enqueue(envelope) {
    this.seq = u64Inc(this.seq);
    const copy = cloneEnvelope(envelope);
    if (!copy.seq || u64Eq(copy.seq, u64(0, 0))) {
      copy.seq = u64(this.seq.hi, this.seq.lo);
    }
    const ring = copy.kind === 'upcall' ? this.upcalls : this.hot;
    ring.pushCopy(copy);
    const stored = cloneEnvelope(copy);
    this.recentBuf.push(cloneEnvelope(stored));
    if (this.recentBuf.length > this.recentLimit) {
      this.recentBuf.splice(0, this.recentBuf.length - this.recentLimit);
    }
    const key = ticketKey(stored.ticket);
    let bucket = this.byTicket.get(key);
    if (!bucket) {
      bucket = [];
      this.byTicket.set(key, bucket);
    }
    bucket.push(cloneEnvelope(stored));
    if (bucket.length > this.recentLimit) bucket.splice(0, bucket.length - this.recentLimit);
    if (this.autoDrain) this._scheduleDrain();
    return stored;
  }

  _copiesForTicket(ticket) {
    const accepted = acceptTicket(ticket);
    const out = [];
    const seen = new Set();
    const consider = (event) => {
      if (!ticketsMatch(event.ticket, accepted)) return;
      const k = `${u64Key(event.seq)}:${event.kind}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(cloneEnvelope(event));
    };
    for (const event of this.peek()) consider(event);
    for (const event of this.recentBuf) consider(event);
    const bucket = this.byTicket.get(ticketKey(accepted));
    if (bucket) for (const event of bucket) consider(event);
    out.sort((a, b) => seqCmp(a.seq, b.seq));
    return out;
  }

  _scheduleDrain() {
    if (this._drainScheduled) return;
    this._drainScheduled = true;
    setImmediate(() => {
      this._drainScheduled = false;
      this.drain();
    });
  }
}

export function createMonitorIpc(opts) {
  return new MonitorIpc(opts);
}
