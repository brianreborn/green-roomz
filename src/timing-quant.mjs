export const QUANT_MS = 50;

export function ceilQuantum(elapsedMs, q = QUANT_MS) {
  const e = Math.max(0, Number(elapsedMs) || 0);
  const n = Math.max(1, Number(q) || QUANT_MS);
  return Math.ceil((e + Number.EPSILON) / n) * n;
}

/** Sleep this many ms after PolicyGate release so the hop is off-slot. */
export function holdMs(startedAt, now = Date.now(), q = QUANT_MS) {
  const elapsed = Math.max(0, now - startedAt);
  return Math.max(0, ceilQuantum(elapsed, q) - elapsed);
}
