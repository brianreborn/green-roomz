import os from 'node:os';

export const DEFAULT_THREADS = 4;

/** min(DEFAULT_THREADS, logical CPUs). Empty/default profiles must not ask for 4 on a 2-CPU box. */
export function defaultThreadCount(logical = os.cpus().length) {
  const n = Number(logical);
  const cpus = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
  return Math.max(1, Math.min(DEFAULT_THREADS, cpus));
}

function requestedThreads(spec) {
  if (typeof spec === 'number' && Number.isFinite(spec)) return Math.max(0, Math.trunc(spec));
  if (spec == null || typeof spec !== 'object') return 0;
  if (typeof spec.threads === 'number' && Number.isFinite(spec.threads)) {
    return Math.max(0, Math.trunc(spec.threads));
  }
  const nums = Object.values(spec).filter((value) => typeof value === 'number' && Number.isFinite(value));
  return nums.length ? Math.max(0, Math.trunc(nums[0])) : 0;
}

/** First-fit disjoint CPU sets. Exhaustion yields an empty set (no wrap). */
export function allocateSets(logical, agents = []) {
  const n = Math.max(0, Number(logical) || 0);
  const out = [];
  let cursor = 0;
  for (const spec of agents) {
    const threads = requestedThreads(spec);
    const cpus = [];
    if (threads > 0 && cursor + threads <= n) {
      for (let i = 0; i < threads; i += 1) cpus.push(cursor++);
    }
    out.push(cpus);
  }
  return out;
}

export function disjoint(a = [], b = []) {
  const seen = new Set(a);
  return b.every((cpu) => !seen.has(cpu));
}

export class CpuSetAllocator {
  constructor(logical) {
    this.logical = Math.max(0, Number(logical) || 0);
    this.used = 0;
    this.held = new Map();
  }

  remaining() {
    return Math.max(0, this.logical - this.used);
  }

  allocate(alias, threads) {
    const want = Math.max(0, Number(threads) || 0);
    if (!alias || want <= 0 || want > this.remaining()) return [];
    this.release(alias);
    if (want > this.remaining()) return [];
    const start = this.used;
    const cpus = [];
    for (let i = 0; i < want; i += 1) cpus.push(start + i);
    this.used += want;
    this.held.set(alias, cpus);
    return cpus;
  }

  release(alias) {
    const cpus = this.held.get(alias);
    if (!cpus) return;
    this.held.delete(alias);
    this.used = Math.max(0, this.used - cpus.length);
  }
}
