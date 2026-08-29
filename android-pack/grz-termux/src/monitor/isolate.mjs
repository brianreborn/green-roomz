/**
 * Isolate: map / unmap / grant as call-table symbols.
 * In-memory capability bits only. Per-threat encrypt/wipe mapping is out of v1.
 *
 * Callers: place, respond (on lockdown). SAD / workers / logger / 8080 MUST NOT
 * grant themselves lockdown.
 *
 * encrypt-volumes is out_of_v1. lockdown / reboot / secure_reboot stay uncallable
 * (throw). Do not wipe swap/RAM. Missing capability => reject, never no-op.
 *
 * Note 9 / no AID_ROOT: map / wipe / secure_reboot reject with capability missing.
 * No 3-replica vote. No mapped-host GPU ring.
 */

import {
  assertCaller,
  makeReject,
  hashStringToU64,
} from './api.mjs';

export const ISOLATE_CALLS = Object.freeze(['map', 'unmap', 'grant']);

export const ISO_CAP = Object.freeze({
  MAP: 1 << 0,
  UNMAP: 1 << 1,
  GRANT: 1 << 2,
  WIPE: 1 << 3,
  ENCRYPT: 1 << 4,
  LOCKDOWN: 1 << 5,
  REBOOT: 1 << 6,
  SECURE_REBOOT: 1 << 7,
  AID_ROOT: 1 << 8,
  DOWN: 1 << 9,
  FREEZE: 1 << 10,
  HALT: 1 << 11,
});

const CALL_CAP = Object.freeze({
  map: ISO_CAP.MAP,
  unmap: ISO_CAP.UNMAP,
  grant: ISO_CAP.GRANT,
  wipe: ISO_CAP.WIPE,
  encrypt: ISO_CAP.ENCRYPT,
  'encrypt-volumes': ISO_CAP.ENCRYPT,
  lockdown: ISO_CAP.LOCKDOWN,
  reboot: ISO_CAP.REBOOT,
  secure_reboot: ISO_CAP.SECURE_REBOOT,
});

const VERB_ALIASES = Object.freeze({
  secureReboot: 'secure_reboot',
  encryptVolumes: 'encrypt-volumes',
  encrypt_volumes: 'encrypt-volumes',
  encrypt: 'encrypt-volumes',
});

const ENCRYPT = new Set(['encrypt', 'encrypt-volumes']);
const UNCALLABLE = new Set(['lockdown', 'reboot', 'secure_reboot']);
const AID_ROOT_CALLS = new Set(['map', 'wipe', 'secure_reboot']);
const LOCKDOWN_MASK = (
  ISO_CAP.LOCKDOWN | ISO_CAP.REBOOT | ISO_CAP.SECURE_REBOOT | ISO_CAP.WIPE
) >>> 0;
const SELF_GRANT_DENIED = new Set(['sad', 'worker', 'logger', 'green-roomz']);
const BIT_NAME = Object.freeze(Object.fromEntries(
  Object.entries(ISO_CAP).map(([name, bit]) => [name.toLowerCase(), bit]),
));

function normalizeVerb(verb) {
  const raw = String(verb ?? '');
  return VERB_ALIASES[raw] ?? raw;
}

function bitOf(name) {
  if (typeof name === 'number' && Number.isFinite(name)) return name >>> 0;
  const key = String(name ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (key === 'encrypt_volumes' || key === 'encryptvolumes') return ISO_CAP.ENCRYPT;
  if (key in BIT_NAME) return BIT_NAME[key];
  return 0;
}

function parseBits(partial, payload) {
  const src = partial && typeof partial === 'object' ? partial : {};
  const body = payload && typeof payload === 'object' ? payload : {};
  const raw = src.bits ?? src.mask ?? src.rightsMask ?? body.bits ?? body.mask ?? body.rightsMask;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw >>> 0;
  if (Array.isArray(raw)) {
    let acc = 0;
    for (const item of raw) acc |= bitOf(item);
    return acc >>> 0;
  }
  if (typeof raw === 'string') return bitOf(raw);
  const named = src.cap ?? src.verb ?? body.cap ?? body.verb;
  if (named != null && named !== '') return bitOf(named);
  return 0;
}

function payloadOf(partial) {
  return partial && typeof partial === 'object' && partial.payload && typeof partial.payload === 'object'
    ? partial.payload
    : {};
}

function hasAidRoot(opts, options) {
  const explicit = opts.aidRoot ?? options.aidRoot;
  if (explicit === true) return true;
  if (explicit === false) return false;
  const platform = String(opts.platform ?? options.platform ?? '').toLowerCase();
  if (platform === 'note9' || platform === 'android' || platform === 'stock-note9') return false;
  return true;
}

function capabilityMissing(call, opts, options) {
  const caps = opts.capabilities ?? options.capabilities;
  if (caps != null) {
    const set = caps instanceof Set ? caps : new Set(Array.isArray(caps) ? caps : [caps]);
    if (!(set.has('*') || set.has(call) || set.has(normalizeVerb(call)))) return true;
  }
  const mask = opts.rightsMask ?? options.rightsMask;
  if (mask != null) {
    const bit = CALL_CAP[call] ?? CALL_CAP[normalizeVerb(call)];
    if (bit != null && ((mask >>> 0) & bit) !== bit) return true;
  }
  if (AID_ROOT_CALLS.has(call) && !hasAidRoot(opts, options)) return true;
  return false;
}

function neverInvokeRespond(respond) {
  if (!respond || typeof respond !== 'object') return;
  // v1: isolate never raises respond verbs. Spies exist so tests can prove it.
}

function decorateReject(envelope, extra) {
  envelope.ok = false;
  envelope.implemented = false;
  envelope.voted = false;
  envelope.mappedHostGpuRing = false;
  envelope.wiped = false;
  envelope.wipedSwap = false;
  envelope.wipedRam = false;
  if (extra.bits !== undefined) envelope.bits = extra.bits;
  if (extra.call !== undefined) envelope.call = extra.call;
  return envelope;
}

function rejectOf({ from, to, reason, target, ticket, source, bits, call }) {
  const keyTicket = ticket != null
    ? ticket
    : hashStringToU64(`${from}|${to}|${reason}|${target}|${call ?? ''}|${bits ?? ''}`);
  const envelope = makeReject({
    ticket: keyTicket,
    from,
    to,
    reason: String(reason),
    source: String(source ?? 'isolate'),
    target: target ?? 'machine',
  });
  return decorateReject(envelope, { bits, call });
}

export function createIsolate(options = {}) {
  const respond = options.respond;
  const granted = new Map();
  const mapped = new Map();

  neverInvokeRespond(respond);

  function maskOf(table, subject) {
    return table.get(subject) ?? 0;
  }

  function orBits(table, subject, bits) {
    const next = (maskOf(table, subject) | (bits >>> 0)) >>> 0;
    table.set(subject, next);
    return next;
  }

  function clearBits(table, subject, bits) {
    const next = (maskOf(table, subject) & ~(bits >>> 0)) >>> 0;
    table.set(subject, next);
    return next;
  }

  function subjectOf(partial, payload, fallback = 'place') {
    const src = partial && typeof partial === 'object' ? partial : {};
    const name = src.subject ?? src.target ?? payload.subject ?? payload.target;
    if (name == null || name === '') return fallback;
    return String(name);
  }

  function callerOf(partial, opts, fallback = 'place') {
    return String(opts.callerRole ?? partial.callerRole ?? fallback);
  }

  function gate(call, partial, opts, bits) {
    neverInvokeRespond(respond);
    const callerRole = callerOf(partial, opts);
    assertCaller(call, callerRole);
    const payload = payloadOf(partial);
    const target = partial.target ?? payload.target ?? 'machine';
    const ticket = partial.ticket ?? payload.ticket ?? opts.ticket;
    const source = partial.source ?? opts.source ?? callerRole;
    if (capabilityMissing(call, opts, options)) {
      return {
        blocked: true,
        reject: rejectOf({
          from: call,
          to: call,
          reason: 'missing capability',
          target,
          ticket,
          source,
          bits: bits ?? 0,
          call,
        }),
      };
    }
    return { blocked: false, callerRole, payload, target, ticket, source };
  }

  function denySelfLockdown(call, subject, bits, meta) {
    if (!SELF_GRANT_DENIED.has(subject)) return null;
    if (((bits >>> 0) & LOCKDOWN_MASK) === 0) return null;
    return rejectOf({
      from: call,
      to: 'lockdown',
      reason: `lockdown not allowed for ${subject}`,
      target: meta.target,
      ticket: meta.ticket,
      source: meta.source,
      bits,
      call,
    });
  }

  function rejectEncryptOrWipe(call, verb, bits, meta) {
    const v = normalizeVerb(verb);
    if (ENCRYPT.has(v) || ((bits >>> 0) & ISO_CAP.ENCRYPT) === ISO_CAP.ENCRYPT) {
      return rejectOf({
        from: call,
        to: 'encrypt-volumes',
        reason: 'out_of_v1',
        target: meta.target,
        ticket: meta.ticket,
        source: meta.source,
        bits,
        call,
      });
    }
    if (v === 'wipe' || ((bits >>> 0) & ISO_CAP.WIPE) === ISO_CAP.WIPE) {
      if (capabilityMissing('wipe', meta.opts, options)) {
        return rejectOf({
          from: call,
          to: 'wipe',
          reason: 'missing capability',
          target: meta.target,
          ticket: meta.ticket,
          source: meta.source,
          bits,
          call,
        });
      }
      return rejectOf({
        from: call,
        to: 'wipe',
        reason: 'out_of_v1',
        target: meta.target,
        ticket: meta.ticket,
        source: meta.source,
        bits,
        call,
      });
    }
    return null;
  }

  function throwUncallable(verb) {
    neverInvokeRespond(respond);
    const v = normalizeVerb(verb);
    if (UNCALLABLE.has(v)) throw new Error('complex-last');
  }

  function okResult(call, extra) {
    return {
      ok: true,
      call,
      implemented: true,
      voted: false,
      mappedHostGpuRing: false,
      wiped: false,
      wipedSwap: false,
      wipedRam: false,
      ...extra,
    };
  }

  function grant(partial = {}, opts = {}) {
    const src = partial && typeof partial === 'object' ? partial : {};
    const payload = payloadOf(src);
    const bits = parseBits(src, payload);
    const verb = normalizeVerb(src.verb ?? src.op ?? payload.verb ?? payload.op ?? '');
    const gateResult = gate('grant', src, opts, bits);
    if (gateResult.blocked) return gateResult.reject;
    const subject = subjectOf(src, payload, gateResult.callerRole);
    const denied = denySelfLockdown('grant', subject, bits, { ...gateResult, opts });
    if (denied) return denied;
    const enc = rejectEncryptOrWipe('grant', verb, bits, { ...gateResult, opts });
    if (enc) return enc;
    throwUncallable(verb);
    const next = orBits(granted, subject, bits);
    return okResult('grant', {
      bits: next,
      granted: next,
      subject,
      target: gateResult.target,
      ticket: gateResult.ticket,
    });
  }

  function map(partial = {}, opts = {}) {
    const src = partial && typeof partial === 'object' ? partial : {};
    const payload = payloadOf(src);
    const bits = parseBits(src, payload);
    const verb = normalizeVerb(src.verb ?? src.op ?? payload.verb ?? payload.op ?? '');
    const gateResult = gate('map', src, opts, bits);
    if (gateResult.blocked) return gateResult.reject;
    const subject = subjectOf(src, payload, gateResult.callerRole);
    const denied = denySelfLockdown('map', subject, bits, { ...gateResult, opts });
    if (denied) return denied;
    const enc = rejectEncryptOrWipe('map', verb, bits, { ...gateResult, opts });
    if (enc) return enc;
    throwUncallable(verb);
    orBits(granted, subject, bits);
    const next = orBits(mapped, subject, bits);
    return okResult('map', {
      bits: next,
      mapped: true,
      subject,
      target: gateResult.target,
      ticket: gateResult.ticket,
    });
  }

  function unmap(partial = {}, opts = {}) {
    const src = partial && typeof partial === 'object' ? partial : {};
    const payload = payloadOf(src);
    const bits = parseBits(src, payload);
    const verb = normalizeVerb(src.verb ?? src.op ?? payload.verb ?? payload.op ?? '');
    const gateResult = gate('unmap', src, opts, bits);
    if (gateResult.blocked) return gateResult.reject;
    const subject = subjectOf(src, payload, gateResult.callerRole);
    const enc = rejectEncryptOrWipe('unmap', verb, bits, { ...gateResult, opts });
    if (enc) return enc;
    throwUncallable(verb);
    const next = bits ? clearBits(mapped, subject, bits) : (mapped.set(subject, 0), 0);
    return okResult('unmap', {
      bits: next,
      mapped: next !== 0,
      subject,
      target: gateResult.target,
      ticket: gateResult.ticket,
    });
  }

  function apply(verbOrPartial, optsArg = {}) {
    let verbIn = verbOrPartial;
    let opts = optsArg && typeof optsArg === 'object' ? optsArg : {};
    let partial = {};
    if (verbOrPartial && typeof verbOrPartial === 'object' && !Array.isArray(verbOrPartial)) {
      partial = verbOrPartial;
      verbIn = verbOrPartial.verb ?? verbOrPartial.op ?? verbOrPartial.call;
      opts = { ...verbOrPartial, ...opts };
    } else {
      partial = { verb: verbIn, ...opts };
    }
    const verb = normalizeVerb(verbIn);
    neverInvokeRespond(respond);
    if (capabilityMissing(verb, opts, options) && (AID_ROOT_CALLS.has(verb) || ENCRYPT.has(verb) || verb === 'wipe')) {
      return rejectOf({
        from: verb,
        to: verb,
        reason: 'missing capability',
        target: partial.target ?? 'machine',
        ticket: partial.ticket ?? opts.ticket,
        source: opts.callerRole ?? partial.source ?? 'isolate',
        call: verb,
      });
    }
    if (ENCRYPT.has(verb)) {
      return rejectOf({
        from: 'isolate',
        to: 'encrypt-volumes',
        reason: 'out_of_v1',
        target: partial.target ?? 'machine',
        ticket: partial.ticket ?? opts.ticket,
        source: opts.callerRole ?? 'isolate',
        call: verb,
      });
    }
    if (verb === 'wipe') {
      return rejectOf({
        from: 'isolate',
        to: 'wipe',
        reason: 'out_of_v1',
        target: partial.target ?? 'machine',
        ticket: partial.ticket ?? opts.ticket,
        source: opts.callerRole ?? 'isolate',
        call: verb,
      });
    }
    if (UNCALLABLE.has(verb)) throw new Error('complex-last');
    if (verb === 'map') return map(partial, opts);
    if (verb === 'unmap') return unmap(partial, opts);
    if (verb === 'grant') return grant(partial, opts);
    return rejectOf({
      from: 'isolate',
      to: verb,
      reason: verb ? `unknown call ${verb}` : 'missing verb',
      target: partial.target ?? 'machine',
      ticket: partial.ticket ?? opts.ticket,
      source: opts.callerRole ?? 'isolate',
      call: verb,
    });
  }

  function bitsOf(subject = 'place') {
    return maskOf(granted, String(subject));
  }

  function mappedBits(subject = 'place') {
    return maskOf(mapped, String(subject));
  }

  function lockdown() {
    neverInvokeRespond(respond);
    throw new Error('complex-last');
  }

  function reboot() {
    neverInvokeRespond(respond);
    throw new Error('complex-last');
  }

  function secure_reboot() {
    neverInvokeRespond(respond);
    throw new Error('complex-last');
  }

  function encrypt(partial = {}, opts = {}) {
    return apply({ ...partial, verb: 'encrypt-volumes' }, opts);
  }

  function wipe(partial = {}, opts = {}) {
    return apply({ ...partial, verb: 'wipe' }, opts);
  }

  return Object.freeze({
    map,
    unmap,
    grant,
    apply,
    bitsOf,
    mappedBits,
    encrypt,
    wipe,
    lockdown,
    reboot,
    secure_reboot,
  });
}

const defaults = createIsolate();
export const map = defaults.map;
export const unmap = defaults.unmap;
export const grant = defaults.grant;
