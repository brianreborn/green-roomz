/**
 * State graph for target=machine and target=ifX (same edges).
 * snapshot is an ACTION, not a state.
 * Reject: {kind:'reject', from, to, reason} same ticket, idempotent, not voted.
 */

import { normalizeU64, u64Key } from './ids.mjs';

export const STATES = Object.freeze(['up', 'down', 'frozen', 'sleep', 'halt', 'resetting']);

export const VERBS = Object.freeze([
  'up', 'down', 'freeze', 'thaw', 'sleep', 'wake', 'halt', 'reset', 'snapshot',
]);

const STATE_EDGES = Object.freeze({
  up: Object.freeze(['down', 'frozen', 'sleep', 'halt', 'resetting']),
  down: Object.freeze(['up', 'halt', 'resetting']),
  frozen: Object.freeze(['up', 'halt', 'resetting']),
  sleep: Object.freeze(['up', 'halt', 'resetting']),
  halt: Object.freeze(['resetting']),
  resetting: Object.freeze(['down']),
});

const VERB_NEXT = Object.freeze({
  up: {
    down: 'down',
    freeze: 'frozen',
    sleep: 'sleep',
    halt: 'halt',
    reset: 'resetting',
    snapshot: 'up',
  },
  down: {
    up: 'up',
    halt: 'halt',
    reset: 'resetting',
  },
  frozen: {
    thaw: 'up',
    halt: 'halt',
    reset: 'resetting',
    snapshot: 'frozen',
  },
  sleep: {
    wake: 'up',
    halt: 'halt',
    reset: 'resetting',
  },
  halt: {
    reset: 'resetting',
  },
  resetting: {
    down: 'down',
  },
});

const rejectsByTicket = new Map();

export function canTransition(from, to) {
  const edges = STATE_EDGES[from];
  if (!edges) return false;
  if (!STATES.includes(to)) return false;
  return edges.includes(to);
}

export function nextState(state, verb) {
  const table = VERB_NEXT[state];
  if (!table) return undefined;
  return table[verb];
}

function impliedTo(state, verb) {
  if (verb === 'snapshot') return state;
  if (verb === 'freeze') return 'frozen';
  if (verb === 'thaw') return 'up';
  if (verb === 'sleep') return 'sleep';
  if (verb === 'wake') return 'up';
  if (verb === 'halt') return 'halt';
  if (verb === 'reset') return 'resetting';
  if (verb === 'up') return 'up';
  if (verb === 'down') return 'down';
  return verb;
}

export function isValidTarget(target) {
  if (target === 'machine' || target === 'all-nics') return true;
  if (typeof target === 'string' && target.length > 0) return true;
  return false;
}


function ephemeralReject({ from, to, reason, target }) {
  return {
    seq: normalizeU64(null),
    kind: 'reject',
    source: '',
    ticket: normalizeU64(null),
    ts: Date.now(),
    payload: { from, to, reason },
    target: target ?? 'machine',
    from,
    to,
    reason,
    voted: false,
  };
}

/**
 * Apply a verb. Illegal edges return { ok:false, reject } without changing state.
 * snapshot leaves state unchanged when allowed (up | frozen).
 */
export function applyTransition(state, verb, target = 'machine') {
  const tgt = target == null || target === '' ? 'machine' : String(target);
  const v = String(verb ?? '');
  if (v === 'snapshot') {
    if (state === 'up' || state === 'frozen') {
      return { ok: true, state, target: tgt, verb: v, action: 'snapshot' };
    }
    return {
      ok: false,
      state,
      target: tgt,
      verb: v,
      reject: ephemeralReject({ from: state, to: state, reason: 'snapshot only from up or frozen', target: tgt }),
    };
  }
  const next = nextState(state, v);
  if (next === undefined) {
    const to = impliedTo(state, v);
    return {
      ok: false,
      state,
      target: tgt,
      verb: v,
      reject: ephemeralReject({
        from: state,
        to,
        reason: `illegal transition ${state} --${v}--> ${to}`,
        target: tgt,
      }),
    };
  }
  return { ok: true, state: next, target: tgt, verb: v };
}

/**
 * Idempotent reject on the same ticket: first envelope wins, later calls return it.
 * Envelope fields stay {seq, kind, source, ticket, ts, payload, target}.
 * from/to/reason also sit on the object so the SHALL shape is {kind, from, to, reason}.
 */
export function makeReject(partial = {}) {
  const ticket = normalizeU64(partial.ticket);
  const key = u64Key(ticket);
  const existing = rejectsByTicket.get(key);
  if (existing) return existing;
  const from = partial.from;
  const to = partial.to;
  const reason = String(partial.reason ?? 'rejected');
  const envelope = {
    seq: normalizeU64(partial.seq),
    kind: 'reject',
    source: String(partial.source ?? ''),
    ticket,
    ts: Number.isFinite(partial.ts) ? Number(partial.ts) : Date.now(),
    payload: { from, to, reason },
    target: partial.target ?? 'machine',
    from,
    to,
    reason,
    voted: false,
  };
  rejectsByTicket.set(key, envelope);
  return envelope;
}

export function peekReject(ticket) {
  return rejectsByTicket.get(u64Key(ticket)) ?? null;
}
