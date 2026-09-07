/**
 * Canonical security-monitor COMMON API.
 * Envelope fields (do not fork): seq, kind, source, ticket, ts, payload, target.
 * seq and ticket are 64-bit {hi, lo} uint32 pairs.
 */

import { normalizeU64, u64 } from './ids.mjs';
import { isAllowlistedOp } from './calls.mjs';
import { makeReject } from './states.mjs';

export {
  SLOT_BYTES,
  HOT_RING_SLOTS,
  UPCALL_SLOTS,
  u32,
  u64,
  normalizeU64,
  hashStringToU64,
  u64Eq,
  u64Inc,
  u64Key,
  nextPow2,
  ringMask,
  ringIndex32,
  packSlot,
  unpackSlot,
} from './ids.mjs';

export {
  ALLOWLISTED_OPS,
  ROLES,
  CALL_TABLE,
  isAllowlistedOp,
  callerDeniedReason,
  assertCaller,
} from './calls.mjs';

export {
  STATES,
  VERBS,
  canTransition,
  nextState,
  isValidTarget,
  applyTransition,
  makeReject,
  peekReject,
} from './states.mjs';

export {
  IDENTITY_FIELDS,
  snapshotIdentity,
} from './identity.mjs';

export const ENVELOPE_FIELDS = Object.freeze([
  'seq', 'kind', 'source', 'ticket', 'ts', 'payload', 'target',
]);

export const KINDS = Object.freeze([
  'hop', 'upcall', 'reply', 'reject', 'grade', 'vote', 'credit', 'snapshot', 'observe',
]);

export const TARGETS = Object.freeze(['machine', 'all-nics']);

export function makeEnvelope(partial = {}) {
  const kind = String(partial.kind ?? '');
  const payload = partial.payload == null ? {} : partial.payload;
  return {
    seq: normalizeU64(partial.seq),
    kind,
    source: String(partial.source ?? ''),
    ticket: normalizeU64(partial.ticket),
    ts: Number.isFinite(partial.ts) ? Number(partial.ts) : Date.now(),
    payload,
    target: partial.target ?? 'machine',
  };
}

export function makeUpcall(partial = {}) {
  const inner = partial.payload && typeof partial.payload === 'object' ? partial.payload : partial;
  const op = inner.op;
  const agent = inner.agent ?? '';
  const envelope = makeEnvelope({
    ...partial,
    kind: 'upcall',
    payload: { agent, op },
  });
  if (!isAllowlistedOp(op)) {
    envelope.allowlisted = false;
  } else {
    envelope.allowlisted = true;
  }
  return envelope;
}

function uncallableEnvelope(verb) {
  const envelope = makeReject({
    from: 'api',
    to: verb,
    reason: `${verb} is uncallable (v1)`,
    source: 'api',
    target: 'machine',
  });
  envelope.ok = false;
  envelope.executed = false;
  envelope.implemented = false;
  envelope.spawned = false;
  envelope.voted = false;
  return envelope;
}

export function vote() {
  return uncallableEnvelope('vote');
}

export function secureReboot() {
  return uncallableEnvelope('secure_reboot');
}

export function zeroId() {
  return u64(0, 0);
}
