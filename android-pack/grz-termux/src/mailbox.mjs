import { createHash } from 'node:crypto';

/**
 * Mailbox envelope (PQ-style). Same shape for this Node ring, a future CUDA
 * mapped ring, and a PQFreeBSD MAC monitor — producers speak this, not a GGUF:
 *
 * {
 *   seq:     number | {hi,lo},  // monotonic publish sequence (number on live hops)
 *   kind:    string,            // success | agent_unavailable | route_exhausted | hop | ...
 *   source:  string,            // effectiveAlias or producer id
 *   ticket:  string | {hi,lo},  // session / correlation id; strings stay strings
 *   ts:      number,            // Date.now()
 *   payload: object | string    // small object, or sha256 hex if a long string
 *   target:  string             // machine | ifX | all-nics (default machine)
 * }
 *
 * SPSC by default (one producer, one drainer). MPSC is the same envelope:
 * additional producers just call push(); JS serializes them. Extra monitors
 * register via onEvent() and see every drained slot (broadcast, not steal).
 * push() is non-blocking: drop-oldest when full, return immediately, never
 * wait for drain. Drain runs on setImmediate so the user path is not stalled.
 *
 * Live hops keep numeric seq + string ticket. Monitor IPC may pass {hi,lo}.
 */

function nextPow2(n) {
  const v = Math.max(2, Number(n) || 2);
  return 1 << Math.ceil(Math.log2(v));
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

function isU64Like(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && 'hi' in value && 'lo' in value;
}

function cloneU64(value) {
  return { hi: (Number(value.hi) || 0) >>> 0, lo: (Number(value.lo) || 0) >>> 0 };
}

function normalizeMailboxTicket(ticket) {
  if (ticket == null || ticket === '') return '';
  if (isU64Like(ticket)) return cloneU64(ticket);
  return String(ticket);
}

function normalizeMailboxSeq(seq, fallbackNumber) {
  if (isU64Like(seq)) return cloneU64(seq);
  if (typeof seq === 'number' && Number.isFinite(seq)) return seq;
  return fallbackNumber;
}

export class Mailbox {
  constructor({ capacity = 256, recentLimit = 64, onEvent, autoDrain = true } = {}) {
    this.capacity = nextPow2(capacity);
    this.mask = this.capacity - 1;
    this.slots = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.seq = 0;
    this.pushed = 0;
    this.dropped = 0;
    this.drained = 0;
    this.autoDrain = autoDrain !== false;
    this.listeners = [];
    if (typeof onEvent === 'function') this.listeners.push(onEvent);
    this.recentLimit = Math.max(1, Number(recentLimit) || 64);
    this.recentBuf = [];
    this._drainScheduled = false;
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
      capacity: this.capacity,
      size: this.size,
      pushed: this.pushed,
      dropped: this.dropped,
      drained: this.drained,
      seq: this.seq,
      listeners: this.listeners.length,
    };
  }

  recent(limit = this.recentLimit) {
    const requested = Number(limit);
    const n = Math.max(0, Math.min(this.recentBuf.length, Number.isFinite(requested) ? requested : this.recentLimit));
    if (n === 0) return [];
    return this.recentBuf.slice(-n).map((event) => ({ ...event, payload: event.payload }));
  }

  push(partial = {}) {
    const nextSeq = this.seq + 1;
    const event = {
      seq: normalizeMailboxSeq(partial.seq, nextSeq),
      kind: String(partial.kind ?? ''),
      source: String(partial.source ?? ''),
      ticket: normalizeMailboxTicket(partial.ticket),
      ts: Number.isFinite(partial.ts) ? Number(partial.ts) : Date.now(),
      payload: clonePayload(partial.payload),
      target: partial.target ?? 'machine',
    };
    if (this.size === this.capacity) {
      this.tail = (this.tail + 1) & this.mask;
      this.size -= 1;
      this.dropped += 1;
    }
    this.slots[this.head] = event;
    this.head = (this.head + 1) & this.mask;
    this.size += 1;
    this.seq = nextSeq;
    this.pushed += 1;
    this.recentBuf.push(event);
    if (this.recentBuf.length > this.recentLimit) this.recentBuf.splice(0, this.recentBuf.length - this.recentLimit);
    if (this.autoDrain) this._scheduleDrain();
    return { ok: true, seq: nextSeq, dropped: this.dropped, size: this.size };
  }

  drain(callback) {
    const out = [];
    const listeners = typeof callback === 'function' ? [callback, ...this.listeners] : this.listeners;
    while (this.size > 0) {
      const event = this.slots[this.tail];
      this.slots[this.tail] = undefined;
      this.tail = (this.tail + 1) & this.mask;
      this.size -= 1;
      this.drained += 1;
      out.push(event);
      for (const listener of listeners) {
        try { listener(event); } catch {}
      }
    }
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
