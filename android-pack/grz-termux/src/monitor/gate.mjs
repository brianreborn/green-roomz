/**
 * GPU gate: host-side begin/end around one packed conv/GEMM worker.
 * IPC symbols only. MUST NOT wait on a vote.
 *
 * MUST NOT launch respond, isolate, place, logger, Fortuna, NTP, sockets,
 * or resident SAD as CUDA kernels.
 * MUST NOT use the 8600 copy engine for mailbox copies.
 * No Afterburner, no clock loops, no CUDA sample reruns.
 *
 * Overlap intent: CPU llama + one packed GPU pipeline.
 * sm_1.1 has no concurrentKernels.
 */

import {
  assertCaller,
} from './api.mjs';

export const GATE_CALLS = Object.freeze(['begin', 'end']);

/** Only these GPU workers may be gated. */
export const GPU_KERNELS = Object.freeze(['conv', 'gemm']);

/** MUST NOT appear as CUDA launches on SMs. */
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

export const PIPELINE = Object.freeze({
  sm: '1.1',
  concurrentKernels: false,
  cpu: 'llama',
  gpu: 'packed',
  hostSide: true,
  copyEngineMailbox: false,
  afterburner: false,
  clockLoops: false,
  cudaSampleRerun: false,
});

const RESPOND_VERBS = new Set(['lockdown', 'reboot', 'secure_reboot']);

const KERNEL_ALIASES = Object.freeze({
  conv: 'conv',
  convolution: 'conv',
  convolutionseparable: 'conv',
  gemm: 'gemm',
  sgemm: 'gemm',
  matrixmul: 'gemm',
});

function neverInvoke(spies) {
  if (!spies || typeof spies !== 'object') return;
  // v1: host-side bookkeeping only. Spies exist so tests can prove we skip them.
}

function normalizeKernel(name) {
  const raw = String(name ?? 'conv');
  const key = raw.toLowerCase();
  if (FORBIDDEN_CUDA_KERNELS.includes(key)) {
    throw new Error(`MUST NOT launch ${raw} as a CUDA kernel`);
  }
  const mapped = KERNEL_ALIASES[key];
  if (!mapped) {
    throw new Error(`gate only wraps conv/GEMM, not ${raw}`);
  }
  return mapped;
}

function callerOf(partial, opts, fallback) {
  return String(opts.callerRole ?? partial.callerRole ?? fallback);
}

function denyRespond(partial, opts, callerRole) {
  const call = opts.call ?? partial.call;
  if (RESPOND_VERBS.has(String(call ?? ''))) {
    assertCaller(call, callerRole);
  }
}

/**
 * Host-side occupancy bookkeeping. Never cudaLaunch, never vote, never
 * Afterburner / clock loops / SDK sample reruns, never the 8600 copy engine.
 */
export function createGate(options = {}) {
  neverInvoke(options.vote);
  neverInvoke(options.respond);
  neverInvoke(options.cuda);
  neverInvoke(options.afterburner);
  neverInvoke(options.copyEngine);

  let open = false;
  let current = null;

  function begin(partial = {}, opts = {}) {
    const callerRole = callerOf(partial, opts, 'worker');
    assertCaller('begin', callerRole);
    denyRespond(partial, opts, callerRole);

    const kernel = normalizeKernel(partial.kernel ?? partial.op ?? 'conv');
    if (open) {
      throw new Error('sm_1.1 has no concurrentKernels');
    }

    const record = {
      ok: true,
      call: 'begin',
      kernel,
      pipeline: PIPELINE.gpu,
      sm: PIPELINE.sm,
      hostSide: true,
      voted: false,
      waitedOnVote: false,
      copyEngineMailbox: false,
      concurrentKernels: false,
      afterburner: false,
      clockLoops: false,
      cudaSampleRerun: false,
      overlap: Object.freeze({ cpu: PIPELINE.cpu, gpu: PIPELINE.gpu }),
      source: String(partial.source ?? callerRole),
      ticket: partial.ticket ?? null,
    };
    open = true;
    current = record;
    return record;
  }

  function end(partial = {}, opts = {}) {
    const callerRole = callerOf(partial, opts, 'worker');
    assertCaller('end', callerRole);
    denyRespond(partial, opts, callerRole);

    const record = {
      ok: true,
      call: 'end',
      kernel: current?.kernel ?? null,
      hostSide: true,
      voted: false,
      waitedOnVote: false,
      copyEngineMailbox: false,
      concurrentKernels: false,
      afterburner: false,
      clockLoops: false,
      cudaSampleRerun: false,
      overlap: Object.freeze({ cpu: PIPELINE.cpu, gpu: PIPELINE.gpu }),
      source: String(partial.source ?? callerRole),
      ticket: partial.ticket ?? current?.ticket ?? null,
    };
    open = false;
    current = null;
    return record;
  }

  return Object.freeze({ begin, end });
}

const defaults = createGate();
export const begin = defaults.begin;
export const end = defaults.end;
