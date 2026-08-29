/**
 * Call table: who may invoke which monitor call.
 * lockdown / reboot / secure_reboot: respond after vote ONLY.
 * SAD, workers, logger, and the 8080 process MUST NOT call those.
 */

export const ALLOWLISTED_OPS = Object.freeze(['observeHop', 'health', 'snapshot']);

export const ROLES = Object.freeze([
  'worker',
  'gpu_gate',
  'gate',
  'monitor',
  'green-roomz',
  'ipc',
  'ticket_owner',
  'handler',
  'logger',
  'admin',
  'respond',
  'policy',
  'sad',
  'isolate',
  'place',
  'scheduler',
  'network',
  'os',
  'ntp',
  'entropy',
]);

const EVERYONE = Object.freeze([...ROLES]);

/** Call name -> owner + allowed caller roles. */
export const CALL_TABLE = Object.freeze({
  post: Object.freeze({ owner: 'ipc', callers: EVERYONE }),
  wait: Object.freeze({ owner: 'ipc', callers: Object.freeze(['ticket_owner']) }),
  reply: Object.freeze({ owner: 'ipc', callers: Object.freeze(['handler']) }),
  emit: Object.freeze({ owner: 'logger', callers: Object.freeze(['ipc', 'monitor']) }),
  read: Object.freeze({ owner: 'logger', callers: Object.freeze(['admin', 'respond']) }),
  check: Object.freeze({ owner: 'policy', callers: Object.freeze(['ipc', 'sad']) }),
  label: Object.freeze({ owner: 'policy', callers: Object.freeze(['isolate', 'ipc']) }),
  map: Object.freeze({ owner: 'isolate', callers: Object.freeze(['place', 'respond']) }),
  unmap: Object.freeze({ owner: 'isolate', callers: Object.freeze(['place', 'respond']) }),
  grant: Object.freeze({ owner: 'isolate', callers: Object.freeze(['place', 'respond']) }),
  bind: Object.freeze({ owner: 'place', callers: Object.freeze(['ipc', 'scheduler']) }),
  yield: Object.freeze({ owner: 'place', callers: Object.freeze(['ipc', 'scheduler']) }),
  begin: Object.freeze({ owner: 'gate', callers: Object.freeze(['gpu_gate', 'gate', 'worker', 'ipc']) }),
  end: Object.freeze({ owner: 'gate', callers: Object.freeze(['gpu_gate', 'gate', 'worker', 'ipc']) }),
  down: Object.freeze({ owner: 'network', callers: Object.freeze(['sad', 'policy', 'admin']) }),
  up: Object.freeze({ owner: 'network', callers: Object.freeze(['sad', 'policy', 'admin']) }),
  freeze: Object.freeze({ owner: 'network', callers: Object.freeze(['sad', 'policy', 'admin', 'respond']) }),
  thaw: Object.freeze({ owner: 'network', callers: Object.freeze(['sad', 'policy', 'admin', 'respond']) }),
  sleep: Object.freeze({ owner: 'network', callers: Object.freeze(['sad', 'policy', 'admin', 'place']) }),
  wake: Object.freeze({ owner: 'network', callers: Object.freeze(['sad', 'policy', 'admin', 'place']) }),
  reset: Object.freeze({ owner: 'network', callers: Object.freeze(['network', 'respond', 'admin']) }),
  halt: Object.freeze({ owner: 'respond', callers: Object.freeze(['respond', 'network']) }),
  snapshot: Object.freeze({ owner: 'os', callers: Object.freeze(['os', 'ipc', 'admin']) }),
  lockdown: Object.freeze({ owner: 'respond', callers: Object.freeze(['respond']) }),
  reboot: Object.freeze({ owner: 'respond', callers: Object.freeze(['respond']) }),
  secure_reboot: Object.freeze({ owner: 'respond', callers: Object.freeze(['respond']) }),
});

const VOTE_ONLY = new Set(['lockdown', 'reboot', 'secure_reboot']);
const VOTE_DENIED = new Set(['sad', 'worker', 'logger', 'green-roomz']);

export function isAllowlistedOp(op) {
  return ALLOWLISTED_OPS.includes(String(op ?? ''));
}

export function callerDeniedReason(call, callerRole) {
  const name = String(call ?? '');
  const role = String(callerRole ?? '');
  const entry = CALL_TABLE[name];
  if (!entry) return `unknown call ${name}`;
  if (VOTE_ONLY.has(name) && VOTE_DENIED.has(role)) {
    return `${name} not allowed for ${role} (respond after vote only)`;
  }
  if (name === 'reset' && (role === 'logger' || role === 'ntp' || role === 'entropy')) {
    return `reset not allowed for ${role}`;
  }
  if (!entry.callers.includes(role)) {
    return `${name} not allowed for ${role}`;
  }
  return null;
}

/**
 * Throws if the role may not issue the call; otherwise returns { ok: true }.
 * Denied callers get an Error whose message is the reject reason.
 */
export function assertCaller(call, callerRole) {
  const reason = callerDeniedReason(call, callerRole);
  if (reason) throw new Error(reason);
  return { ok: true, call: String(call ?? ''), callerRole: String(callerRole ?? '') };
}
