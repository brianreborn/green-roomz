/**
 * Policy kernel: check + label only.
 * Off the hop hot path — check is async / advisory for v1, not a blocking hop gate.
 * GRADE is a distinct type from VERB. Names only: watch, quarantine, stop, wipe.
 * Grade→verb mapping is policy-private, not a SAD-callable function.
 * SAD/workers post grades; they MUST NOT invoke respond.
 * Reboot-class raises (lockdown / reboot / secure_reboot) stay INERT until a
 * non-8080 respond process exists. Wipe is never executed.
 * Missing capability => reject, never no-op success.
 * 3-replica vote is out of this sprint.
 */

import {
  assertCaller,
  makeReject,
} from './api.mjs';

/** Type discriminator. Distinct from verb strings in states.VERBS. */
export const GRADE = 'grade';

/** Grade names only. Not verbs. */
export const GRADES = Object.freeze(['watch', 'quarantine', 'stop', 'wipe']);

const REBOOT_CLASS = new Set(['lockdown', 'reboot', 'secure_reboot']);

/** Policy-private default map. Not exported; SAD posts grades, not this. */
const GRADE_VERB = Object.freeze({
  watch: 'observe',
  quarantine: 'down',
  stop: 'lockdown',
  wipe: 'secure_reboot',
});

function isGradeName(name) {
  return GRADES.includes(String(name ?? ''));
}

function isRebootClass(verb) {
  return REBOOT_CLASS.has(String(verb ?? ''));
}

function payloadOf(partial) {
  return partial && typeof partial === 'object' && partial.payload && typeof partial.payload === 'object'
    ? partial.payload
    : {};
}

function hasNon8080Respond(options) {
  const proc = options.respondProcess;
  if (proc == null || proc === false) return false;
  const port = typeof proc === 'number' ? proc : proc.port;
  if (port == null) return false;
  if (Number(port) === 8080) return false;
  return true;
}

/**
 * Explicit capability lists reject unknown verbs.
 * Null/undefined means "no extra mask" (reboot-class still inert without respond).
 */
function capabilityMissing(verb, opts, options) {
  const caps = opts.capabilities ?? options.capabilities;
  if (caps == null) return false;
  const set = caps instanceof Set ? caps : new Set(Array.isArray(caps) ? caps : [caps]);
  if (set.has('*') || set.has(String(verb))) return false;
  return true;
}

function normalizeMapEntries(map) {
  if (map == null || typeof map !== 'object') return [];
  if (map.grade != null && map.verb != null) {
    return [{ grade: String(map.grade), verb: String(map.verb) }];
  }
  return Object.entries(map).map(([grade, verb]) => ({
    grade: String(grade),
    verb: String(verb),
  }));
}

function rejectMissing(partial, from, to, callerRole) {
  return makeReject({
    ticket: partial.ticket,
    from,
    to,
    reason: 'missing capability',
    source: callerRole,
    target: partial.target ?? 'machine',
  });
}

function neverInvokeRespond(respond) {
  if (!respond || typeof respond !== 'object') return;
  // v1: policy never raises respond verbs. Spies exist so tests can prove it.
}

export function createPolicy(options = {}) {
  const respond = options.respond;
  const labels = new Map();
  const activeMap = { ...GRADE_VERB };
  const intendedMap = { ...GRADE_VERB };

  neverInvokeRespond(respond);

  function applyMapEdit(map, partial, opts) {
    const callerRole = opts.callerRole ?? 'isolate';
    const entries = normalizeMapEntries(map);
    const inertRaises = [];

    for (const { grade, verb } of entries) {
      if (!isGradeName(grade)) {
        return makeReject({
          ticket: partial.ticket,
          from: 'map',
          to: grade,
          reason: `unknown grade ${grade}`,
          source: callerRole,
          target: partial.target ?? 'machine',
        });
      }
      if (capabilityMissing(verb, opts, options)) {
        return rejectMissing(partial, grade, verb, callerRole);
      }
      intendedMap[grade] = verb;
      if (isRebootClass(verb) && !hasNon8080Respond(options)) {
        inertRaises.push({ grade, verb });
        continue;
      }
      activeMap[grade] = verb;
    }

    return {
      ok: true,
      type: GRADE,
      executed: false,
      inert: inertRaises.length > 0,
      inertRaises,
      map: { ...activeMap },
    };
  }

  function postedGrade(envelope, gradeName, opts, callerRole) {
    if (!isGradeName(gradeName)) {
      return makeReject({
        ticket: envelope.ticket,
        from: 'grade',
        to: gradeName,
        reason: `unknown grade ${gradeName}`,
        source: envelope.source ?? callerRole,
        target: envelope.target ?? 'machine',
      });
    }

    const verb = intendedMap[gradeName] ?? GRADE_VERB[gradeName];
    if (capabilityMissing(verb, opts, options)) {
      return rejectMissing(envelope, gradeName, verb, callerRole);
    }

    const reboot = isRebootClass(verb);
    const inert = reboot && !hasNon8080Respond(options) || gradeName === 'wipe';

    // Never invoke respond — SAD/workers post grades only.
    neverInvokeRespond(respond);

    return {
      ok: true,
      kind: 'grade',
      type: GRADE,
      grade: gradeName,
      verb,
      executed: false,
      inert: Boolean(inert),
      advisory: true,
      source: envelope.source ?? callerRole,
      ticket: envelope.ticket,
      target: envelope.target ?? 'machine',
    };
  }

  /**
   * Advisory check. Async. Not a hop gate.
   * Hop-shaped envelopes never throw (caller defaults to ipc).
   * Grade envelopes from SAD record the grade and do not raise respond verbs.
   */
  async function check(input = {}, opts = {}) {
    const envelope = typeof input === 'string'
      ? { kind: 'observe', payload: { label: input } }
      : (input && typeof input === 'object' ? input : {});
    const callerRole = opts.callerRole ?? 'ipc';
    assertCaller('check', callerRole);

    const call = opts.call ?? envelope.call ?? payloadOf(envelope).call ?? payloadOf(envelope).op;
    if (call === 'lockdown' || call === 'reboot' || call === 'secure_reboot') {
      assertCaller(call, callerRole);
    }

    const payload = payloadOf(envelope);
    const posted = payload.grade ?? envelope.grade;
    if (envelope.kind === 'grade' || (posted != null && isGradeName(posted))) {
      return postedGrade(envelope, String(posted ?? payload.grade), opts, callerRole);
    }

    const name = typeof input === 'string'
      ? input
      : String(payload.label ?? envelope.label ?? '');
    const tagged = name ? labels.get(name) : null;
    const grade = tagged?.grade ?? 'watch';

    return {
      ok: true,
      advisory: true,
      blocking: false,
      kind: envelope.kind || 'hop',
      type: GRADE,
      grade,
      executed: false,
    };
  }

  /**
   * Assign a label, or edit the threat-to-action map.
   * Map-edits that would raise reboot-class verbs stay inert without a
   * non-8080 respond process. Missing capability rejects.
   */
  function label(partial = {}, opts = {}) {
    const body = partial && typeof partial === 'object' ? partial : {};
    const callerRole = opts.callerRole ?? 'isolate';
    assertCaller('label', callerRole);

    const payload = payloadOf(body);
    const map = body.map ?? payload.map;
    if (map != null) {
      return applyMapEdit(map, body, opts);
    }

    const gradeName = String(body.grade ?? payload.grade ?? 'watch');
    if (gradeName && !isGradeName(gradeName)) {
      return makeReject({
        ticket: body.ticket,
        from: 'label',
        to: gradeName,
        reason: `unknown grade ${gradeName}`,
        source: callerRole,
        target: body.target ?? 'machine',
      });
    }

    if (capabilityMissing(GRADE_VERB[gradeName], opts, options)) {
      return rejectMissing(body, 'label', GRADE_VERB[gradeName], callerRole);
    }

    const name = String(body.label ?? body.name ?? payload.label ?? payload.name ?? '');
    const rec = Object.freeze({
      ok: true,
      type: GRADE,
      label: name,
      grade: gradeName,
      target: body.target ?? payload.target ?? 'machine',
      ticket: body.ticket,
      executed: false,
      inert: isRebootClass(GRADE_VERB[gradeName]) && !hasNon8080Respond(options),
    });
    if (name) labels.set(name, rec);
    return rec;
  }

  return Object.freeze({ check, label });
}

const defaults = createPolicy();
export const check = defaults.check;
export const label = defaults.label;
