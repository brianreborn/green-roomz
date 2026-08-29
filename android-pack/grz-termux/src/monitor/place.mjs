/**
 * Place: bind and yield only (scheduler/IPC callers).
 * In-memory: a worker can bind a core/slice id and yield it.
 *
 * qodesh 1+1: at most one place slot besides llama.
 * Do not steal the llama/GPU floor.
 * MUST NOT as CUDA launch. MUST NOT call lockdown/reboot/secure_reboot.
 * Missing capability => reject. SAD cannot bind the respond slice.
 * No 3-replica vote. No busy-poll.
 */

import {
  assertCaller,
  makeReject,
  hashStringToU64,
} from './api.mjs';

export const PLACE_CALLS = Object.freeze(['bind', 'yield']);

/** Floor (do not steal): llama/GPU gate, IPC, logger, Fortuna, network, respond voters. */
export const FLOOR = Object.freeze([
  'llama',
  'gpu',
  'gpu_gate',
  'ipc',
  'logger',
  'fortuna',
  'network',
  'respond',
]);

/** qodesh Athlon II X2: llama vs one monitor slice. Not 3-replica. */
export const QODESH = Object.freeze({
  cores: 2,
  layout: '1+1',
  llama: true,
  extraSlots: 1,
  replicas: 1,
});

/** MUST NOT appear as CUDA launches on SMs. Place is host-side only. */
export const FORBIDDEN_CUDA_KERNELS = Object.freeze([
  'respond',
  'isolate',
  'place',
  'logger',
  'fortuna',
  'ntp',
  'sockets',
  'sad',
]);

export const LAYOUT = Object.freeze({
  hostSide: true,
  cudaLaunch: false,
  busyPoll: false,
  replicas: 1,
  vote: false,
  layout: '1+1',
  llamaFloor: true,
});

const RESPOND_VERBS = new Set(['lockdown', 'reboot', 'secure_reboot']);

const LLAMA_FLOOR = new Set([
  'llama',
  'llama_floor',
  'llamafloor',
  'cpu_llama',
  'gpu',
  'gpu_gate',
  'gpu_floor',
  'gpufloor',
]);

const RESPOND_SLICES = new Set([
  'respond',
  'respond_slice',
  'respondslice',
  'respond_voter',
  'respond_voters',
]);

const FLOOR_ALIASES = new Set([
  ...LLAMA_FLOOR,
  ...RESPOND_SLICES,
  'ipc',
  'logger',
  'fortuna',
  'network',
]);

function neverInvoke(spies) {
  if (!spies || typeof spies !== 'object') return;
  // v1: host-side bookkeeping only. Spies exist so tests can prove we skip them.
}

function payloadOf(partial) {
  return partial && typeof partial === 'object' && partial.payload && typeof partial.payload === 'object'
    ? partial.payload
    : {};
}

function callerOf(partial, opts, fallback) {
  return String(opts.callerRole ?? partial.callerRole ?? fallback);
}

function capabilityMissing(call, opts, options) {
  const caps = opts.capabilities ?? options.capabilities;
  if (caps == null) return false;
  const set = caps instanceof Set ? caps : new Set(Array.isArray(caps) ? caps : [caps]);
  if (set.has('*') || set.has(String(call))) return false;
  return true;
}

function sliceKey(name) {
  return String(name ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isLlamaFloor(slice) {
  return LLAMA_FLOOR.has(sliceKey(slice));
}

function isRespondSlice(slice) {
  const key = sliceKey(slice);
  return RESPOND_SLICES.has(key) || key === 'respond';
}

function isFloorSlice(slice) {
  const key = sliceKey(slice);
  return FLOOR.includes(key) || FLOOR_ALIASES.has(key);
}

function isSad(role, worker) {
  const r = sliceKey(role);
  const w = sliceKey(worker);
  return r === 'sad' || w === 'sad' || w.startsWith('sad');
}

function sliceOf(partial, inner) {
  const raw = partial.slice ?? partial.core ?? partial.slot
    ?? inner.slice ?? inner.core ?? inner.slot;
  if (raw == null || raw === '') return '';
  return String(raw);
}

function workerOf(partial, inner) {
  const raw = partial.worker ?? partial.agent ?? inner.worker ?? inner.agent;
  if (raw == null || raw === '') return '';
  return String(raw);
}

function workerRoleOf(partial, inner, opts) {
  return String(
    opts.workerRole
    ?? partial.workerRole
    ?? inner.workerRole
    ?? partial.role
    ?? inner.role
    ?? '',
  );
}

function rejectOf(partial, from, to, reason, source) {
  const ticket = partial.ticket != null
    ? partial.ticket
    : hashStringToU64(`${from}|${to}|${reason}|${source}|${partial.slice ?? ''}`);
  const envelope = makeReject({
    ticket,
    from,
    to,
    reason,
    source,
    target: partial.target ?? 'machine',
  });
  if (envelope.ok === undefined) envelope.ok = false;
  envelope.voted = false;
  envelope.busyPoll = false;
  envelope.cudaLaunch = false;
  envelope.replicas = 1;
  return envelope;
}

function denyRespond(partial, opts, callerRole) {
  const call = opts.call ?? partial.call;
  if (RESPOND_VERBS.has(String(call ?? ''))) {
    assertCaller(call, callerRole);
  }
}

function denyCudaLaunch(partial, inner) {
  const kernel = partial.kernel ?? inner.kernel ?? partial.op ?? inner.op;
  const asCuda = partial.asCuda ?? inner.asCuda
    ?? partial.cudaLaunch ?? inner.cudaLaunch
    ?? partial.cuda ?? inner.cuda;
  if (asCuda === true || (typeof asCuda === 'string' && asCuda)) {
    const name = String(kernel ?? asCuda ?? 'place');
    throw new Error(`MUST NOT launch ${name} as a CUDA kernel`);
  }
  if (kernel == null || kernel === '') return;
  const key = sliceKey(kernel);
  if (FORBIDDEN_CUDA_KERNELS.includes(key) || key === 'place' || LLAMA_FLOOR.has(key)) {
    throw new Error(`MUST NOT launch ${kernel} as a CUDA kernel`);
  }
}

/**
 * In-memory core/slice binder. Never cudaLaunch, never vote, never
 * lockdown/reboot/secure_reboot, never busy-poll.
 */
export function createPlace(options = {}) {
  neverInvoke(options.vote);
  neverInvoke(options.respond);
  neverInvoke(options.cuda);
  neverInvoke(options.lockdown);

  const extraSlots = Number.isFinite(options.extraSlots)
    ? Number(options.extraSlots)
    : QODESH.extraSlots;

  /** slice id -> occupancy record. llama floor is pre-occupied. */
  const occupied = new Map();
  occupied.set('llama', Object.freeze({
    ok: true,
    call: 'bind',
    worker: 'llama',
    slice: 'llama',
    floor: true,
    hostSide: true,
    cudaLaunch: false,
    voted: false,
    busyPoll: false,
    replicas: 1,
  }));

  let extraCount = 0;

  function findExtra(slice, worker) {
    if (slice && occupied.has(slice) && occupied.get(slice).floor !== true) {
      return occupied.get(slice);
    }
    if (worker) {
      for (const rec of occupied.values()) {
        if (rec.floor) continue;
        if (rec.worker === worker) return rec;
      }
    }
    return null;
  }

  function bind(partial = {}, opts = {}) {
    const callerRole = callerOf(partial, opts, 'scheduler');
    assertCaller('bind', callerRole);
    denyRespond(partial, opts, callerRole);

    const inner = payloadOf(partial);
    denyCudaLaunch(partial, inner);

    if (capabilityMissing('bind', opts, options)) {
      return rejectOf(partial, 'bind', 'place', 'missing capability', callerRole);
    }

    const slice = sliceOf(partial, inner) || 'monitor';
    const worker = workerOf(partial, inner) || 'worker';
    const workerRole = workerRoleOf(partial, inner, opts);

    if (isRespondSlice(slice) && isSad(workerRole, worker)) {
      return rejectOf(partial, 'sad', 'respond', 'SAD cannot bind the respond slice', callerRole);
    }

    if (isLlamaFloor(slice) || sliceKey(slice) === 'llama') {
      return rejectOf(partial, 'llama', slice, 'llama floor', callerRole);
    }

    if (isFloorSlice(slice)) {
      const reason = isRespondSlice(slice)
        ? 'respond floor'
        : `${sliceKey(slice)} floor`;
      return rejectOf(partial, 'floor', slice, reason, callerRole);
    }

    if (extraCount >= extraSlots) {
      return rejectOf(partial, 'place', slice, '1+1 extra slot taken', callerRole);
    }

    const existing = occupied.get(slice);
    if (existing && existing.floor !== true) {
      return rejectOf(partial, slice, slice, 'already bound', callerRole);
    }

    const record = {
      ok: true,
      call: 'bind',
      worker,
      slice,
      floor: false,
      hostSide: true,
      cudaLaunch: false,
      voted: false,
      busyPoll: false,
      replicas: 1,
      layout: '1+1',
      source: String(partial.source ?? callerRole),
      ticket: partial.ticket ?? null,
    };
    occupied.set(slice, record);
    extraCount += 1;
    return record;
  }

  function yieldSlot(partial = {}, opts = {}) {
    const callerRole = callerOf(partial, opts, 'scheduler');
    assertCaller('yield', callerRole);
    denyRespond(partial, opts, callerRole);

    const inner = payloadOf(partial);
    denyCudaLaunch(partial, inner);

    if (capabilityMissing('yield', opts, options)) {
      return rejectOf(partial, 'yield', 'place', 'missing capability', callerRole);
    }

    const slice = sliceOf(partial, inner);
    const worker = workerOf(partial, inner);

    if (isLlamaFloor(slice)) {
      return rejectOf(partial, 'llama', slice || 'llama', 'llama floor', callerRole);
    }

    let rec = findExtra(slice, worker);
    if (!rec) {
      if (!slice && !worker) {
        for (const v of occupied.values()) {
          if (!v.floor) {
            rec = v;
            break;
          }
        }
      }
    }

    if (!rec || rec.floor) {
      return rejectOf(partial, 'yield', slice || 'place', 'not bound', callerRole);
    }

    occupied.delete(rec.slice);
    extraCount = Math.max(0, extraCount - 1);

    return {
      ok: true,
      call: 'yield',
      worker: rec.worker,
      slice: rec.slice,
      hostSide: true,
      cudaLaunch: false,
      voted: false,
      busyPoll: false,
      replicas: 1,
      layout: '1+1',
      source: String(partial.source ?? callerRole),
      ticket: partial.ticket ?? rec.ticket ?? null,
    };
  }

  return Object.freeze({
    bind,
    yield: yieldSlot,
  });
}

const defaults = createPlace();
export const bind = defaults.bind;
