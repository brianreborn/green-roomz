/** Magic-byte media allowlist. Defense-only; no stego recovery. */

export const MEDIA_POLICIES = Object.freeze({
  'vision-layout-agent': { kinds: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 8 * 1024 * 1024 },
  'image-generation-agent': { kinds: ['image/png'], maxBytes: 8 * 1024 * 1024 }, // output also scanned
  'audio-transcription-agent': { kinds: ['audio/wav', 'audio/mpeg', 'audio/ogg'], maxBytes: 16 * 1024 * 1024 },
});

const MAGIC = [
  { mime: 'image/png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', test: (b) => b.length >= 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'audio/wav', test: (b) => b.length >= 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE' },
];

export function sniffMime(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  return MAGIC.find((m) => m.test(b))?.mime ?? null;
}

/** Structural end of PNG must equal buffer end (IEND chunk finishes the file). */
export function pngEndsAtIend(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (b.length < 8 + 12) return false;
  let off = 8;
  while (off + 12 <= b.length) {
    const len = b.readUInt32BE(off);
    if (len > 0x7fffffff) return false;
    const type = b.subarray(off + 4, off + 8).toString('binary');
    const next = off + 12 + len;
    if (next > b.length) return false;
    if (type === 'IEND') return next === b.length && len === 0;
    off = next;
  }
  return false;
}

/** RIFF size field at offset 4 must equal buffer length - 8. */
export function wavMatchesRiffSize(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (b.length < 12) return false;
  const size = b.readUInt32LE(4);
  return size + 8 === b.length;
}

export function scanMedia(bytes, { alias, declaredMime } = {}) {
  const policy = MEDIA_POLICIES[alias];
  if (!policy) return { ok: false, reason: 'no media policy' };
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (b.length === 0) return { ok: false, reason: 'empty' };
  if (b.length > policy.maxBytes) return { ok: false, reason: 'too large' };
  const sniffed = sniffMime(b);
  if (!sniffed || !policy.kinds.includes(sniffed)) return { ok: false, reason: 'magic mismatch' };
  if (declaredMime && declaredMime !== sniffed && declaredMime !== 'application/octet-stream') {
    return { ok: false, reason: 'declared mime mismatch' };
  }
  if (sniffed === 'image/png' && !pngEndsAtIend(b)) return { ok: false, reason: 'trailing bytes' };
  if (sniffed === 'audio/wav' && !wavMatchesRiffSize(b)) return { ok: false, reason: 'trailing bytes' };
  return { ok: true, mime: sniffed, bytes: b };
}
