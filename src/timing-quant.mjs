/**
 * Same-box next-acquire remainder. This is not a cross-box defense:
 * gateway sleeps AFTER the HTTP response, so a remote client already saw
 * the true duration. Do not enlarge the quantum to "match tok/s" — that
 * only delays the next local PolicyGate acquire.
 *
 * holdMs is remainder inside one bucket [0, q). It does not add a second
 * random quantum, and it does not map 0 onto q (that was max-delay).
 */

export const TIMING_PRIVACY_MODES = Object.freeze(['off', 'next_acquire', 'response']);

/** Mild same-box remainder only. Not a token-scale pad. */
export const REMAINDER_MS = 50;

/** Named Athlon token length for an explicit `timing_privacy_quantum_ms`, never a default. */
export const TOKEN_MS = 330;

export const WIN_TICK_MS = 16;

export function quantClock() {
  return performance.now();
}

function quantum(q) {
  const n = Math.floor(Number(q));
  if (!Number.isFinite(n) || n < 1) return 0;
  return n;
}

export function ceilQuantum(elapsedMs, q) {
  const n = quantum(q);
  if (n < 1) return 0;
  const e = Math.max(0, Number(elapsedMs) || 0);
  if (e === 0) return 0;
  return Math.ceil(e / n) * n;
}

export function bucketDelay(ms, q) {
  const e = Math.max(0, Number(ms) || 0);
  if (e === 0) return 0;
  return ceilQuantum(e, q);
}

export function quantizeTs(ts, q) {
  const n = quantum(q);
  const t = Math.max(0, Number(ts) || 0);
  if (n < 1) return t;
  return Math.floor(t / n) * n;
}

/**
 * Remainder to the next bucket: [0, q). Exact multiples stay 0.
 * `dither` if true picks uniformly in [pad, q) — still one bucket, not pad+U[0,q).
 */
export function holdMs(startedAt, now = Date.now(), q = 0, random = Math.random, { dither = false } = {}) {
  const n = quantum(q);
  if (n < 1) return 0;
  const start = Number(startedAt);
  const end = Number(now);
  const elapsed = Math.max(0, (Number.isFinite(end) ? end : 0) - (Number.isFinite(start) ? start : 0));
  const pad = Math.max(0, ceilQuantum(elapsed, n) - elapsed);
  if (!dither) return pad;
  const slack = n - pad;
  if (slack <= 0) return pad;
  let u = Number(typeof random === 'function' ? random() : 0);
  if (!Number.isFinite(u)) u = 0;
  u = Math.min(1, Math.max(0, u));
  if (u >= 1) u = 0;
  return pad + Math.floor(u * slack);
}

export function resolveTimingPrivacy(gateway = {}) {
  const mode = gateway.timing_privacy;
  const customQ = Number(gateway.timing_privacy_quantum_ms);
  const qOverride = Number.isFinite(customQ) && customQ > 0 ? Math.floor(customQ) : null;
  if (mode === 'off') return { mode, q: 0, dither: false, holdBeforeResponse: false };
  if (mode === 'next_acquire') {
    return {
      mode,
      q: qOverride ?? REMAINDER_MS,
      dither: Boolean(gateway.timing_privacy_dither),
      holdBeforeResponse: false,
    };
  }
  if (mode === 'response') {
    return {
      mode,
      q: qOverride ?? REMAINDER_MS,
      dither: Boolean(gateway.timing_privacy_dither),
      holdBeforeResponse: true,
    };
  }
  return null;
}

export const TIMING_PRIVACY_INSTALL_HINT =
  'gateway.timing_privacy is required at install (off | next_acquire | response). '
  + 'off = usable, no hop pad. '
  + 'next_acquire = remainder after PolicyGate release (same-box next turn; does not hide HTTP). '
  + 'response = remainder before finishing a non-stream JSON body (cross-box TTFB; streams still leak).';
