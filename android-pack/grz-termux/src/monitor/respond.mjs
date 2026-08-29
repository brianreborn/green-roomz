/**
 * Respond: record votes. Do not execute reboot-class bodies on v1.
 *
 * lockdown / reboot / secure_reboot are UNCALLABLE (reject, never spawn).
 * replicaCount is a host parameter defaulting to 1 (qodesh 1+1). NOT REPLICAS=3.
 * Three vote domains are distinct types: localReplica, livePeer, localEmergency.
 * A lone replica is not majority-of-itself for reboot-class.
 * 8080 / SAD / worker / logger cannot call lockdown/reboot/secure_reboot.
 * Grade is optional and separate from verb. SAD posts do not invoke respond.
 * Missing capability => reject. Note 9 / no AID_ROOT: secure_reboot rejects.
 * halt(machine) is v1-illegal. Votes carry bootId; mismatch is not applied.
 * Vote TTL is caller-supplied (DEFAULT_VOTE_TTL_MS is undefined, not a SHALL).
 */

import {
  assertCaller,
  callerDeniedReason,
  makeReject,
  hashStringToU64,
  normalizeU64,
  u64,
  u64Eq,
  u64Key,
  VERBS,
} from './api.mjs';

import {
  GRADE,
  GRADES,
} from './policy.mjs';

import {
  targetKind,
} from './network.mjs';

export { assertCaller, callerDeniedReason, GRADE, GRADES, VERBS };

/** qodesh host default (1+1). Parameter, not a frozen replica topology. */
export const replicaCount = 1;
export const DEFAULT_REPLICA_COUNT = 1;

/** No SHALL number. Caller supplies ttlMs / expiry on the vote or instance. */
export const DEFAULT_VOTE_TTL_MS = undefined;

/** Unsatisfiable default (localReplica reboot-class cannot self-majority at n=1). */
export const UNSATISFIABLE_QUORUM = Number.NaN;

export const localReplica = 'localReplica';
export const livePeer = 'livePeer';
export const localEmergency = 'localEmergency';

export const VOTE_DOMAINS = Object.freeze({
  localReplica,
  livePeer,
  localEmergency,
});

export const VOTE_DOMAIN_LIST = Object.freeze([
  localReplica,
  livePeer,
  localEmergency,
]);

export const REBOOT_CLASS = Object.freeze(['lockdown', 'reboot', 'secure_reboot']);

export const RESPOND_VERBS = Object.freeze([
  'lockdown', 'reboot', 'secure_reboot', 'halt',
]);

export const RESPOND_CAP = Object.freeze({
  VOTE: 1 << 0,
  LOCKDOWN: 1 << 1,
  REBOOT: 1 << 2,
  SECURE_REBOOT: 1 << 3,
  HALT: 1 << 4,
  AID_ROOT: 1 << 5,
});

const VERB_CAP = Object.freeze({
  vote: RESPOND_CAP.VOTE,
  lockdown: RESPOND_CAP.LOCKDOWN,
  reboot: RESPOND_CAP.REBOOT,
  secure_reboot: RESPOND_CAP.SECURE_REBOOT,
  halt: RESPOND_CAP.HALT,
});

const VERB_ALIASES = Object.freeze({
  secureReboot: 'secure_reboot',
  securereboot: 'secure_reboot',
});

const AID_ROOT_CALLS = new Set(['secure_reboot']);
const ROLE_8080 = new Set(['8080', 'green-roomz']);
const REBOOT_SET = new Set(REBOOT_CLASS);

let bootSeq = 0;

function normalizeVerb(verb) {
  const raw = String(verb ?? '');
  return VERB_ALIASES[raw] ?? raw;
}

function isRebootClass(verb) {
  return REBOOT_SET.has(normalizeVerb(verb));
}

function isVoteDomain(domain) {
  return VOTE_DOMAIN_LIST.includes(String(domain ?? ''));
}

function payloadOf(partial) {
  return partial && typeof partial === 'object' && partial.payload && typeof partial.payload === 'object'
    ? partial.payload
    : {};
}

function roleOf(partial, opts, fallback = 'respond') {
  return String(opts.callerRole ?? opts.role ?? partial.callerRole ?? partial.role ?? fallback);
}

function monotonicNow() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function nextBootId(explicit) {
  if (explicit != null && explicit !== '') return normalizeU64(explicit);
  bootSeq += 1;
  return u64(0xB007, bootSeq);
}

function hasAidRoot(opts, options) {
  const explicit = opts.aidRoot ?? options.aidRoot;
  if (explicit === true) return true;
  if (explicit === false) return false;
  const platform = String(opts.platform ?? options.platform ?? '').toLowerCase();
  if (platform === 'note9' || platform === 'android' || platform === 'stock-note9') return false;
  return true;
}

function is8080(partial, opts, options) {
  const role = roleOf(partial, opts, '');
  if (ROLE_8080.has(role)) return true;
  const port = opts.port ?? partial.port ?? options.port
    ?? options.respondProcess?.port ?? opts.respondProcess?.port;
  if (Number(port) === 8080) return true;
  return false;
}

function capabilityMissing(call, opts, options) {
  const verb = normalizeVerb(call);
  const caps = opts.capabilities ?? options.capabilities;
  if (caps != null) {
    const set = caps instanceof Set ? caps : new Set(Array.isArray(caps) ? caps : [caps]);
    if (!(set.has('*') || set.has(verb) || set.has(call) || set.has('vote') && verb === 'vote')) {
      return true;
    }
  }
  const mask = opts.rightsMask ?? options.rightsMask;
  if (mask != null) {
    const bit = VERB_CAP[verb];
    if (bit != null && ((mask >>> 0) & bit) !== bit) return true;
  }
  if (AID_ROOT_CALLS.has(verb) && !hasAidRoot(opts, options)) return true;
  return false;
}

function ticketOf(partial, payload, opts) {
  const raw = partial?.ticket ?? payload?.ticket ?? opts?.ticket;
  if (raw != null && raw !== '') return normalizeU64(raw);
  return null;
}

function decorateReject(envelope, extra = {}) {
  envelope.ok = false;
  envelope.implemented = false;
  envelope.executed = false;
  envelope.spawned = false;
  envelope.voted = false;
  if (extra.verb !== undefined) envelope.verb = extra.verb;
  if (extra.domain !== undefined) envelope.domain = extra.domain;
  if (extra.call !== undefined) envelope.call = extra.call;
  return envelope;
}

function rejectOf({ from, to, reason, target, ticket, source, verb, domain, call }) {
  const keyTicket = ticket != null
    ? ticket
    : hashStringToU64(`${from}|${to}|${reason}|${target}|${verb ?? ''}|${domain ?? ''}|${call ?? ''}`);
  const envelope = makeReject({
    ticket: keyTicket,
    from,
    to,
    reason: String(reason),
    source: String(source ?? 'respond'),
    target: target ?? 'machine',
  });
  return decorateReject(envelope, { verb, domain, call: call ?? verb });
}

function voteKey(rec) {
  return `${rec.domain}|${rec.verb}|${rec.voter}|${u64Key(rec.ticket)}`;
}

function defaultQuorum({ domain, verb, replicaCount: n, quorum }) {
  if (quorum !== undefined && quorum !== null && quorum !== '') return quorum;
  if (isRebootClass(verb) && domain === localReplica && n < 2) return UNSATISFIABLE_QUORUM;
  return UNSATISFIABLE_QUORUM;
}

function cannotSelfMajority(domain, verb, n) {
  return isRebootClass(verb) && domain === localReplica && n < 2;
}

function isExpired(rec, now, instanceTtl) {
  if (rec.expiry != null && Number.isFinite(rec.expiry)) return now >= rec.expiry;
  const ttl = rec.ttlMs ?? instanceTtl ?? DEFAULT_VOTE_TTL_MS;
  if (ttl == null || !Number.isFinite(ttl)) return false;
  return (now - rec.ts) > ttl;
}

export function makeVoteRecord(partial = {}, opts = {}) {
  const payload = payloadOf(partial);
  const domain = String(partial.domain ?? payload.domain ?? '');
  const verb = normalizeVerb(partial.verb ?? partial.op ?? payload.verb ?? payload.op ?? '');
  const voter = String(partial.voter ?? payload.voter ?? partial.source ?? '');
  const ticket = ticketOf(partial, payload, opts) ?? u64(0, 0);
  const bootId = normalizeU64(partial.bootId ?? payload.bootId ?? opts.bootId);
  const ts = Number.isFinite(partial.ts) ? Number(partial.ts)
    : (Number.isFinite(payload.ts) ? Number(payload.ts) : monotonicNow());
  const rec = {
    ticket,
    domain,
    verb,
    voter,
    bootId: u64(bootId.hi, bootId.lo),
    ts,
    type: domain,
  };
  const grade = partial.grade ?? payload.grade;
  if (grade != null && grade !== '') rec.grade = String(grade);
  const ttlMs = partial.ttlMs ?? payload.ttlMs ?? opts.ttlMs ?? opts.voteTtlMs;
  if (ttlMs != null && Number.isFinite(ttlMs)) rec.ttlMs = Number(ttlMs);
  const expiry = partial.expiry ?? payload.expiry ?? opts.expiry;
  if (expiry != null && Number.isFinite(expiry)) rec.expiry = Number(expiry);
  return rec;
}

export function createRespond(options = {}) {
  const nReplicas = Number(options.replicaCount ?? options.replicas ?? replicaCount);
  const bootId = nextBootId(options.bootId);
  const instanceTtl = options.voteTtlMs ?? options.ttlMs ?? DEFAULT_VOTE_TTL_MS;
  const votes = new Map();
  let applied = 0;

  function currentBoot() {
    return u64(bootId.hi, bootId.lo);
  }

  function denyIllegal(call, partial, opts, extra = {}) {
    const payload = payloadOf(partial);
    const target = partial.target ?? payload.target ?? opts.target ?? 'machine';
    const ticket = ticketOf(partial, payload, opts);
    const source = partial.source ?? opts.source ?? roleOf(partial, opts);
    const verb = normalizeVerb(call);

    if (is8080(partial, opts, options)) {
      return rejectOf({
        from: roleOf(partial, opts, '8080'),
        to: verb,
        reason: `${verb} not allowed for 8080 (respond after vote only)`,
        target,
        ticket,
        source,
        verb,
        domain: extra.domain,
        call: verb,
      });
    }

    const role = roleOf(partial, opts);
    const denied = callerDeniedReason(verb, role);
    if (denied) {
      return rejectOf({
        from: role,
        to: verb,
        reason: denied,
        target,
        ticket,
        source,
        verb,
        domain: extra.domain,
        call: verb,
      });
    }

    if (capabilityMissing(verb, opts, options)) {
      return rejectOf({
        from: role,
        to: verb,
        reason: 'missing capability',
        target,
        ticket,
        source,
        verb,
        domain: extra.domain,
        call: verb,
      });
    }

    if (verb === 'halt' && targetKind(target) === 'machine') {
      return rejectOf({
        from: role,
        to: 'halt',
        reason: 'halt(machine) is v1-illegal',
        target,
        ticket,
        source,
        verb,
        call: 'halt',
      });
    }

    return null;
  }

  function uncallable(verb, partial, opts) {
    const payload = payloadOf(partial);
    const target = partial.target ?? payload.target ?? 'machine';
    const ticket = ticketOf(partial, payload, opts);
    const source = partial.source ?? opts.source ?? roleOf(partial, opts);
    return rejectOf({
      from: roleOf(partial, opts),
      to: verb,
      reason: `${verb} is uncallable (v1; respond records votes, never executes)`,
      target,
      ticket,
      source,
      verb,
      call: verb,
    });
  }

  /**
   * Record a vote. Does not execute. Boot-id mismatch is not applied.
   * Grade, if present, is stored separately and is not a verb.
   */
  function vote(partial = {}, opts = {}) {
    const src = partial && typeof partial === 'object' ? partial : {};
    const payload = payloadOf(src);
    const rec = makeVoteRecord(src, { ...opts, bootId: src.bootId ?? payload.bootId ?? opts.bootId });
    const target = src.target ?? payload.target ?? 'machine';
    const ticket = rec.ticket;
    const source = src.source ?? opts.source ?? rec.voter ?? 'respond';

    if (!isVoteDomain(rec.domain)) {
      return rejectOf({
        from: rec.domain || 'vote',
        to: rec.verb,
        reason: rec.domain ? `unknown vote domain ${rec.domain}` : 'missing vote domain',
        target,
        ticket,
        source,
        verb: rec.verb,
        domain: rec.domain,
        call: 'vote',
      });
    }

    if (capabilityMissing('vote', opts, options)) {
      return rejectOf({
        from: roleOf(src, opts),
        to: 'vote',
        reason: 'missing capability',
        target,
        ticket,
        source,
        verb: rec.verb,
        domain: rec.domain,
        call: 'vote',
      });
    }

    const carried = src.bootId ?? payload.bootId ?? opts.bootId;
    if (carried == null || carried === '') {
      return rejectOf({
        from: rec.voter,
        to: rec.verb,
        reason: 'vote must carry boot-id',
        target,
        ticket,
        source,
        verb: rec.verb,
        domain: rec.domain,
        call: 'vote',
      });
    }

    if (!u64Eq(rec.bootId, currentBoot())) {
      return rejectOf({
        from: rec.voter,
        to: rec.verb,
        reason: 'boot-id mismatch',
        target,
        ticket,
        source,
        verb: rec.verb,
        domain: rec.domain,
        call: 'vote',
      });
    }

    const key = voteKey(rec);
    const existing = votes.get(key);
    if (existing) return { ok: true, applied: false, executed: false, duplicate: true, vote: { ...existing } };

    const stored = Object.freeze({ ...rec, bootId: u64(rec.bootId.hi, rec.bootId.lo), ticket: u64(rec.ticket.hi, rec.ticket.lo) });
    votes.set(key, stored);
    applied += 1;
    return {
      ok: true,
      applied: true,
      executed: false,
      spawned: false,
      kind: 'vote',
      type: stored.domain,
      vote: { ...stored },
      replicaCount: nReplicas,
    };
  }

  /**
   * Tally per domain. Quorum is an explicit argument.
   * Default for localReplica reboot-class on this host (n=1) is NaN / unsatisfiable.
   * localEmergency does not wait on WAN / livePeer. Never executes.
   */
  function tally(domainOrOpts, optsArg = {}) {
    let domainIn = domainOrOpts;
    let opts = optsArg && typeof optsArg === 'object' ? optsArg : {};
    if (domainOrOpts && typeof domainOrOpts === 'object' && !Array.isArray(domainOrOpts)) {
      domainIn = domainOrOpts.domain;
      opts = { ...domainOrOpts, ...opts };
    }
    const domain = String(domainIn ?? '');
    const verb = normalizeVerb(opts.verb ?? opts.op ?? '');
    const ticket = opts.ticket != null && opts.ticket !== '' ? normalizeU64(opts.ticket) : null;
    const now = Number.isFinite(opts.now) ? Number(opts.now) : monotonicNow();

    if (!isVoteDomain(domain)) {
      return rejectOf({
        from: domain || 'tally',
        to: verb,
        reason: domain ? `unknown vote domain ${domain}` : 'missing vote domain',
        target: opts.target ?? 'machine',
        ticket,
        source: opts.source ?? 'respond',
        verb,
        domain,
        call: 'tally',
      });
    }

    const quorum = defaultQuorum({
      domain,
      verb,
      replicaCount: nReplicas,
      quorum: opts.quorum,
    });

    const matched = [];
    const seenVoters = new Set();
    for (const rec of votes.values()) {
      if (rec.domain !== domain) continue;
      if (verb && rec.verb !== verb) continue;
      if (ticket && !u64Eq(rec.ticket, ticket)) continue;
      if (!u64Eq(rec.bootId, currentBoot())) continue;
      if (isExpired(rec, now, instanceTtl)) continue;
      if (seenVoters.has(rec.voter)) continue;
      seenVoters.add(rec.voter);
      matched.push({ ...rec });
    }

    const count = matched.length;
    const selfMajorityIllegal = cannotSelfMajority(domain, verb, nReplicas);
    const finite = Number.isFinite(quorum) && quorum > 0;
    const reached = finite && !selfMajorityIllegal && count >= quorum;

    return {
      ok: true,
      domain,
      type: domain,
      verb: verb || undefined,
      count,
      quorum,
      reached,
      replicaCount: nReplicas,
      executed: false,
      spawned: false,
      waitsOnWan: domain === livePeer,
      unsatisfiable: selfMajorityIllegal || !finite,
      votes: matched,
    };
  }

  function respondVerb(verb, partial = {}, opts = {}) {
    const src = partial && typeof partial === 'object' ? partial : {};
    const denied = denyIllegal(verb, src, opts);
    if (denied) return denied;
    return uncallable(verb, src, opts);
  }

  function lockdown(partial = {}, opts = {}) {
    return respondVerb('lockdown', partial, opts);
  }

  function reboot(partial = {}, opts = {}) {
    return respondVerb('reboot', partial, opts);
  }

  function secure_reboot(partial = {}, opts = {}) {
    return respondVerb('secure_reboot', partial, opts);
  }

  function halt(targetOrPartial = 'machine', opts = {}) {
    let partial = targetOrPartial;
    if (typeof targetOrPartial === 'string' || targetOrPartial == null) {
      partial = { target: targetOrPartial ?? 'machine' };
    }
    const denied = denyIllegal('halt', partial, opts);
    if (denied) return denied;
    return uncallable('halt', partial, opts);
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
    if (verb === 'vote') return vote(partial, opts);
    if (verb === 'tally') return tally(partial, opts);
    if (verb === 'lockdown') return lockdown(partial, opts);
    if (verb === 'reboot') return reboot(partial, opts);
    if (verb === 'secure_reboot') return secure_reboot(partial, opts);
    if (verb === 'halt') return halt(partial, opts);
    return rejectOf({
      from: 'respond',
      to: verb,
      reason: verb ? `unknown call ${verb}` : 'missing verb',
      target: partial.target ?? 'machine',
      ticket: ticketOf(partial, payloadOf(partial), opts),
      source: opts.source ?? 'respond',
      verb,
      call: verb,
    });
  }

  return Object.freeze({
    vote,
    tally,
    lockdown,
    reboot,
    secure_reboot,
    secureReboot: secure_reboot,
    halt,
    apply,
    replicaCount: nReplicas,
    bootId: currentBoot(),
    voteTtlMs: instanceTtl,
    records() {
      return [...votes.values()].map((rec) => ({ ...rec }));
    },
    appliedCount() {
      return applied;
    },
  });
}

const defaults = createRespond();
export const vote = defaults.vote;
export const tally = defaults.tally;
export const lockdown = defaults.lockdown;
export const reboot = defaults.reboot;
export const secure_reboot = defaults.secure_reboot;
export const halt = defaults.halt;
