/**
 * 64-bit {hi, lo} uint32 helpers and 32-bit ring index.
 * Ring algorithms MUST be lock-free on 32-bit atomics; lo is the ring atomic.
 * Ring-index wrap MUST NOT be treated as identity (compare full {hi, lo}).
 */

export const SLOT_BYTES = 16;
export const HOT_RING_SLOTS = 256;
export const UPCALL_SLOTS = 16;

export function u32(n) {
  return (Number(n) || 0) >>> 0;
}

export function u64(hi = 0, lo = 0) {
  return { hi: u32(hi), lo: u32(lo) };
}

export function normalizeU64(value) {
  if (value == null || value === '') return u64(0, 0);
  if (typeof value === 'object' && 'hi' in value && 'lo' in value) {
    return u64(value.hi, value.lo);
  }
  if (typeof value === 'bigint') {
    return u64(Number((value >> 32n) & 0xffffffffn), Number(value & 0xffffffffn));
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.max(0, Math.floor(value));
    return u64(Math.floor(n / 0x100000000), n);
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      try {
        return normalizeU64(BigInt(value));
      } catch {
        return hashStringToU64(value);
      }
    }
    if (/^[0-9a-fA-F]+:[0-9a-fA-F]+$/.test(value)) {
      const [hi, lo] = value.split(':');
      return u64(Number.parseInt(hi, 16), Number.parseInt(lo, 16));
    }
    return hashStringToU64(value);
  }
  return u64(0, 0);
}

export function hashStringToU64(text) {
  let lo = 2166136261;
  let hi = 0;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    lo = Math.imul(lo ^ s.charCodeAt(i), 16777619) >>> 0;
    hi = Math.imul(hi ^ lo, 16777619) >>> 0;
  }
  return u64(hi, lo);
}

export function u64Eq(a, b) {
  const x = normalizeU64(a);
  const y = normalizeU64(b);
  return x.hi === y.hi && x.lo === y.lo;
}

export function u64Inc(id) {
  const cur = normalizeU64(id);
  const lo = (cur.lo + 1) >>> 0;
  const hi = lo === 0 ? (cur.hi + 1) >>> 0 : cur.hi;
  return u64(hi, lo);
}

export function u64Key(id) {
  const v = normalizeU64(id);
  return `${v.hi.toString(16)}:${v.lo.toString(16)}`;
}

export function nextPow2(n) {
  const v = Math.max(2, Number(n) || 2);
  return 1 << Math.ceil(Math.log2(v));
}

export function ringMask(slots = HOT_RING_SLOTS) {
  return (nextPow2(slots) - 1) >>> 0;
}

/**
 * 32-bit ring index from seq.lo only. Same index for {hi:0,lo:0} and {hi:1,lo:0}.
 * Identity is u64Eq(seq), never this index.
 */
export function ringIndex32(seqOrLo, slots = HOT_RING_SLOTS) {
  const lo = typeof seqOrLo === 'object' && seqOrLo != null
    ? u32(seqOrLo.lo)
    : u32(seqOrLo);
  return lo & ringMask(slots);
}

export function packSlot(envelope = {}) {
  const buf = new ArrayBuffer(SLOT_BYTES);
  const view = new DataView(buf);
  const seq = normalizeU64(envelope.seq);
  const ticket = normalizeU64(envelope.ticket);
  view.setUint32(0, seq.lo, true);
  view.setUint32(4, seq.hi, true);
  view.setUint32(8, ticket.lo, true);
  view.setUint32(12, ticket.hi, true);
  return new Uint8Array(buf);
}

export function unpackSlot(bytes) {
  const raw = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (!raw || raw.byteLength < SLOT_BYTES) {
    throw new Error('slot shorter than SLOT_BYTES');
  }
  const view = new DataView(raw.buffer, raw.byteOffset, SLOT_BYTES);
  return {
    seq: u64(view.getUint32(4, true), view.getUint32(0, true)),
    ticket: u64(view.getUint32(12, true), view.getUint32(8, true)),
  };
}
