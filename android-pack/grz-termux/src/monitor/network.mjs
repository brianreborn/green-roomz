/**
 * Verb × target matrix for the security-monitor network plane.
 * target is machine | ifX | all-nics.
 *
 * Machine-only (reject on ifX / all-nics): lockdown, reboot, secure_reboot,
 * snapshot, encrypt-volumes (encrypt is out of v1: reason out_of_v1).
 * ifX-only (reject on machine): IFF down/up as nic down/up; DMA freeze/thaw
 * of an if; nic sleep/wake; nic reset; if halt=detach.
 *
 * Same named graph as states.mjs (up/down/frozen/sleep/halt). Illegal combos
 * reject {kind:'reject', from, to, reason} idempotent, not voted.
 * freeze↔sleep MUST reject. mid-reset is a flag, not a frozen extra state.
 *
 * Win11 userspace v1: down/up MAY be implemented:true as symbols.
 * freeze/sleep/reset/halt of NIC and all machine respond verbs are
 * reject-stubs (implemented:false). halt(machine) is v1-illegal.
 * lockdown/reboot/secure_reboot stay uncallable (throw or reject), never execute.
 * Missing capability => reject.
 */

import {
  makeReject,
  hashStringToU64,
} from './api.mjs';

import {
  applyTransition,
  isValidTarget,
} from './states.mjs';

export const TARGET_KINDS = Object.freeze(['machine', 'ifX', 'all-nics']);

export const MACHINE_ONLY = Object.freeze([
  'lockdown', 'reboot', 'secure_reboot', 'snapshot', 'encrypt-volumes',
]);

export const IFX_ONLY = Object.freeze([
  'down', 'up', 'freeze', 'thaw', 'sleep', 'wake', 'reset', 'halt',
]);

/** Respond-owned verbs. Uncallable / v1-illegal on machine. */
export const RESPOND_VERBS = Object.freeze([
  'lockdown', 'reboot', 'secure_reboot', 'halt',
]);

const UNCALLABLE = new Set(['lockdown', 'reboot', 'secure_reboot']);
const ENCRYPT = new Set(['encrypt', 'encrypt-volumes']);
const NIC_REJECT_STUBS = new Set(['freeze', 'thaw', 'sleep', 'wake', 'reset', 'halt']);

const VERB_ALIASES = Object.freeze({
  secureReboot: 'secure_reboot',
  encryptVolumes: 'encrypt-volumes',
  encrypt_volumes: 'encrypt-volumes',
  detach: 'halt',
});

export const NET_CAP = Object.freeze({
  DOWN: 1 << 0,
  UP: 1 << 1,
  FREEZE: 1 << 2,
  THAW: 1 << 3,
  SLEEP: 1 << 4,
  WAKE: 1 << 5,
  RESET: 1 << 6,
  HALT: 1 << 7,
  SNAPSHOT: 1 << 8,
  LOCKDOWN: 1 << 9,
  REBOOT: 1 << 10,
  SECURE_REBOOT: 1 << 11,
});

const VERB_CAP = Object.freeze({
  down: NET_CAP.DOWN,
  up: NET_CAP.UP,
  freeze: NET_CAP.FREEZE,
  thaw: NET_CAP.THAW,
  sleep: NET_CAP.SLEEP,
  wake: NET_CAP.WAKE,
  reset: NET_CAP.RESET,
  halt: NET_CAP.HALT,
  snapshot: NET_CAP.SNAPSHOT,
  lockdown: NET_CAP.LOCKDOWN,
  reboot: NET_CAP.REBOOT,
  secure_reboot: NET_CAP.SECURE_REBOOT,
});

export function normalizeVerb(verb) {
  const raw = String(verb ?? '');
  return VERB_ALIASES[raw] ?? raw;
}

export function targetKind(target) {
  if (target == null || target === '' || target === 'machine') return 'machine';
  if (target === 'all-nics') return 'all-nics';
  return 'ifX';
}

export function resolveTarget(target) {
  if (target == null || target === '') return 'machine';
  return String(target);
}

/**
 * Win11 userspace v1 implementation map.
 * down/up on ifX (and all-nics) are symbols. Everything else is a stub.
 */
export function isImplemented(verb, target) {
  const v = normalizeVerb(verb);
  const kind = targetKind(target);
  if ((v === 'down' || v === 'up') && kind !== 'machine') return true;
  return false;
}

function capabilityMissing(verb, opts, options) {
  const caps = opts.capabilities ?? options.capabilities;
  if (caps != null) {
    const set = caps instanceof Set ? caps : new Set(Array.isArray(caps) ? caps : [caps]);
    if (!(set.has('*') || set.has(verb))) return true;
  }
  const mask = opts.rightsMask ?? options.rightsMask;
  if (mask != null) {
    const bit = VERB_CAP[verb];
    if (bit != null && ((mask >>> 0) & bit) !== bit) return true;
  }
  return false;
}

function neverInvokeRespond(respond) {
  if (!respond || typeof respond !== 'object') return;
  // v1: network never raises respond verbs. Spies exist so tests can prove it.
}

function decorateReject(envelope, extra) {
  if (envelope.ok === undefined) {
    envelope.ok = false;
    envelope.implemented = false;
    envelope.voted = false;
    if (extra.state !== undefined) envelope.state = extra.state;
    if (extra.verb !== undefined) envelope.verb = extra.verb;
  }
  return envelope;
}

function rejectOf({ from, to, reason, target, ticket, source, state, verb }) {
  const keyTicket = ticket != null
    ? ticket
    : hashStringToU64(`${from}|${to}|${reason}|${target}|${verb ?? ''}`);
  const envelope = makeReject({
    ticket: keyTicket,
    from,
    to,
    reason: String(reason),
    source: String(source ?? 'network'),
    target,
  });
  return decorateReject(envelope, { state, verb });
}

export function createNetwork(options = {}) {
  const respond = options.respond;
  const states = new Map();
  const resetting = new Map();

  if (options.states && typeof options.states === 'object') {
    for (const [name, st] of Object.entries(options.states)) {
      states.set(String(name), String(st));
    }
  }

  neverInvokeRespond(respond);

  function currentState(target) {
    return states.get(target) ?? options.state ?? 'up';
  }

  function setState(target, next) {
    states.set(target, next);
    if (next === 'resetting') resetting.set(target, true);
    else resetting.set(target, false);
  }

  function apply(verbOrPartial, targetArg, optsArg = {}) {
    let verbIn = verbOrPartial;
    let targetIn = targetArg;
    let opts = optsArg && typeof optsArg === 'object' ? optsArg : {};
    if (verbOrPartial && typeof verbOrPartial === 'object' && !Array.isArray(verbOrPartial)) {
      verbIn = verbOrPartial.verb ?? verbOrPartial.op ?? verbOrPartial.call;
      targetIn = verbOrPartial.target ?? targetArg;
      opts = { ...verbOrPartial, ...opts };
    }

    const verb = normalizeVerb(verbIn);
    const target = resolveTarget(targetIn ?? opts.target);
    const kind = targetKind(target);
    const from = currentState(target);
    const ticket = opts.ticket;
    const source = opts.source ?? 'network';

    neverInvokeRespond(respond);

    if (!verb) {
      return rejectOf({
        from, to: '', reason: 'missing verb', target, ticket, source, state: from, verb,
      });
    }
    if (!isValidTarget(target)) {
      return rejectOf({
        from, to: verb, reason: 'invalid target', target, ticket, source, state: from, verb,
      });
    }
    if (capabilityMissing(verb, opts, options)) {
      return rejectOf({
        from, to: verb, reason: 'missing capability', target, ticket, source, state: from, verb,
      });
    }
    if (ENCRYPT.has(verb)) {
      return rejectOf({
        from, to: verb, reason: 'out_of_v1', target, ticket, source, state: from, verb,
      });
    }

    if (MACHINE_ONLY.includes(verb) && kind !== 'machine') {
      return rejectOf({
        from, to: verb, reason: `${verb} is machine-only`, target, ticket, source, state: from, verb,
      });
    }
    if (IFX_ONLY.includes(verb) && kind === 'machine') {
      if (verb === 'halt') {
        return rejectOf({
          from, to: 'halt', reason: 'halt(machine) is v1-illegal', target, ticket, source, state: from, verb,
        });
      }
      return rejectOf({
        from, to: verb, reason: `${verb} is ifX-only`, target, ticket, source, state: from, verb,
      });
    }

    if (UNCALLABLE.has(verb)) {
      // machine-only uncallable: throw, never execute.
      throw new Error('complex-last');
    }

    if (verb === 'reset' && resetting.get(target) === true) {
      return rejectOf({
        from, to: 'resetting', reason: 'reset already in progress', target, ticket, source, state: from, verb,
      });
    }

    const graph = applyTransition(from, verb, target);
    if (!graph.ok) {
      const rej = graph.reject;
      return rejectOf({
        from: rej.from,
        to: rej.to,
        reason: rej.reason,
        target,
        ticket,
        source,
        state: from,
        verb,
      });
    }

    const next = graph.state;
    setState(target, next);

    const implemented = isImplemented(verb, target);
    const nicStub = NIC_REJECT_STUBS.has(verb) && kind !== 'machine';

    if (nicStub) {
      return rejectOf({
        from,
        to: next,
        reason: `unimplemented ${verb} (v1 reject-stub)`,
        target,
        ticket,
        source,
        state: next,
        verb,
      });
    }

    return {
      ok: true,
      implemented,
      state: next,
      verb,
      target,
      action: graph.action,
      voted: false,
    };
  }

  function call(verb) {
    return (target, opts) => apply(verb, target, opts);
  }

  return Object.freeze({
    apply,
    down: call('down'),
    up: call('up'),
    freeze: call('freeze'),
    thaw: call('thaw'),
    sleep: call('sleep'),
    wake: call('wake'),
    reset: call('reset'),
    halt: call('halt'),
    snapshot: call('snapshot'),
    lockdown: call('lockdown'),
    reboot: call('reboot'),
    secure_reboot: call('secure_reboot'),
    encrypt: call('encrypt-volumes'),
    stateOf: currentState,
  });
}

const defaults = createNetwork();
export const apply = defaults.apply;
export const down = defaults.down;
export const up = defaults.up;
export const freeze = defaults.freeze;
export const thaw = defaults.thaw;
export const sleep = defaults.sleep;
export const wake = defaults.wake;
export const reset = defaults.reset;
export const halt = defaults.halt;
export const snapshot = defaults.snapshot;
export const lockdown = defaults.lockdown;
export const reboot = defaults.reboot;
export const secure_reboot = defaults.secure_reboot;
