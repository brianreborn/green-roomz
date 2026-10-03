import { closeSync, openSync, readSync } from 'node:fs';

const GGUF_MAGIC = 0x46554747;
const TYPE = {
  UINT8: 0,
  INT8: 1,
  UINT16: 2,
  INT16: 3,
  UINT32: 4,
  INT32: 5,
  FLOAT32: 6,
  BOOL: 7,
  STRING: 8,
  ARRAY: 9,
  UINT64: 10,
  INT64: 11,
  FLOAT64: 12,
};
const FIXED_SIZE = {
  [TYPE.UINT8]: 1,
  [TYPE.INT8]: 1,
  [TYPE.UINT16]: 2,
  [TYPE.INT16]: 2,
  [TYPE.UINT32]: 4,
  [TYPE.INT32]: 4,
  [TYPE.FLOAT32]: 4,
  [TYPE.BOOL]: 1,
  [TYPE.UINT64]: 8,
  [TYPE.INT64]: 8,
  [TYPE.FLOAT64]: 8,
};

class GgufCursor {
  constructor(fd) {
    this.fd = fd;
    this.buf = Buffer.alloc(0);
    this.offset = 0;
  }

  need(n) {
    while (this.buf.length - this.offset < n) {
      const chunk = Buffer.alloc(64 * 1024);
      const got = readSync(this.fd, chunk, 0, chunk.length, null);
      if (got === 0) throw new Error('unexpected eof');
      this.buf = Buffer.concat([this.buf.subarray(this.offset), chunk.subarray(0, got)]);
      this.offset = 0;
    }
  }

  take(n) {
    this.need(n);
    const slice = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }

  u8() { return this.take(1)[0]; }
  i8() { return this.take(1).readInt8(0); }
  u16() { return this.take(2).readUInt16LE(0); }
  i16() { return this.take(2).readInt16LE(0); }
  u32() { return this.take(4).readUInt32LE(0); }
  i32() { return this.take(4).readInt32LE(0); }
  f32() { return this.take(4).readFloatLE(0); }
  u64() { return Number(this.take(8).readBigUInt64LE(0)); }
  i64() { return Number(this.take(8).readBigInt64LE(0)); }
  f64() { return this.take(8).readDoubleLE(0); }

  str() {
    const length = this.u64();
    if (!Number.isFinite(length) || length < 0 || length > 16 * 1024 * 1024) throw new Error('string too long');
    return this.take(length).toString('utf8');
  }

  skipValue(type) {
    if (type === TYPE.STRING) {
      this.str();
      return;
    }
    if (type === TYPE.ARRAY) {
      const itemType = this.u32();
      const count = this.u64();
      if (count > 2_000_000) throw new Error('array too large');
      if (itemType === TYPE.STRING) {
        for (let i = 0; i < count; i += 1) this.str();
        return;
      }
      if (itemType === TYPE.ARRAY) {
        for (let i = 0; i < count; i += 1) this.skipValue(TYPE.ARRAY);
        return;
      }
      const size = FIXED_SIZE[itemType];
      if (!size) throw new Error(`unsupported array type ${itemType}`);
      const bytes = count * size;
      const chunk = 1024 * 1024;
      let remaining = bytes;
      while (remaining > 0) {
        const n = Math.min(remaining, chunk);
        this.take(n);
        remaining -= n;
      }
      return;
    }
    const size = FIXED_SIZE[type];
    if (!size) throw new Error(`unsupported gguf type ${type}`);
    this.take(size);
  }

  readScalar(type) {
    switch (type) {
      case TYPE.UINT8: return this.u8();
      case TYPE.INT8: return this.i8();
      case TYPE.UINT16: return this.u16();
      case TYPE.INT16: return this.i16();
      case TYPE.UINT32: return this.u32();
      case TYPE.INT32: return this.i32();
      case TYPE.FLOAT32: return this.f32();
      case TYPE.BOOL: return this.i8();
      case TYPE.UINT64: return this.u64();
      case TYPE.INT64: return this.i64();
      case TYPE.FLOAT64: return this.f64();
      default: return null;
    }
  }
}

function isBlockCountKey(key) {
  return typeof key === 'string' && (key.endsWith('.block_count') || /^qwen[^.]*\.block_count$/i.test(key));
}

export function readBlockCount(ggufPath) {
  if (!ggufPath) return null;
  let fd;
  try {
    fd = openSync(ggufPath, 'r');
    const cursor = new GgufCursor(fd);
    if (cursor.u32() !== GGUF_MAGIC) return null;
    const version = cursor.u32();
    if (version < 1 || version > 4) return null;
    cursor.u64();
    const nKv = cursor.u64();
    if (!Number.isFinite(nKv) || nKv < 0 || nKv > 16_384) return null;
    for (let i = 0; i < nKv; i += 1) {
      const key = cursor.str();
      const type = cursor.u32();
      if (isBlockCountKey(key)) {
        if (type === TYPE.STRING) {
          const parsed = Number(cursor.str());
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        }
        const value = cursor.readScalar(type);
        return Number.isFinite(value) && value > 0 ? Number(value) : null;
      }
      cursor.skipValue(type);
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch {}
    }
  }
}

export function hybridLayerPoints(nLayers) {
  if (!Number.isFinite(nLayers) || nLayers <= 1) return [];
  const raw = [0.25, 0.5, 0.75].map((fraction) => Math.round(fraction * nLayers));
  return [...new Set(raw)].filter((n) => n > 0 && n < nLayers).sort((a, b) => a - b);
}

export function refineAround(winnerId, nLayers) {
  const match = String(winnerId ?? '').match(/^hybrid-(\d+)$/);
  if (!match || !Number.isFinite(nLayers) || nLayers <= 1) return [];
  const n = Number(match[1]);
  const step = Math.max(1, Math.round(nLayers / 8));
  return [...new Set([n - step, n + step])]
    .filter((point) => point > 0 && point < nLayers && point !== n)
    .sort((a, b) => a - b);
}

function flagValue(args, flag) {
  const index = (args ?? []).indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function isCpuTemplate(profile) {
  return profile?.id === 'cpu-4'
    || flagValue(profile?.args, '--n-gpu-layers') === '0'
    || flagValue(profile?.args, '--device') === 'none';
}

function isVulkanAllTemplate(profile) {
  const ngl = flagValue(profile?.args, '--n-gpu-layers');
  return profile?.id === 'vulkan-all' || ngl === 'all' || ngl === '99';
}

function isHybridProfile(profile) {
  return /^hybrid-\d+$/.test(profile?.id ?? '');
}

export function cloneWithGpuLayers(template, ngl, id) {
  const args = [...(template?.args ?? [])];
  const index = args.indexOf('--n-gpu-layers');
  if (index !== -1 && index + 1 < args.length) args[index + 1] = String(ngl);
  else args.push('--n-gpu-layers', String(ngl));
  return { ...template, id, args };
}

export function expandLayerProfiles(agent, nLayers = readBlockCount(agent?.model)) {
  const profiles = [...(agent?.profiles ?? [])];
  const vulkanTemplate = profiles.find(isVulkanAllTemplate) ?? profiles.find(isHybridProfile);
  const points = Number.isFinite(nLayers) ? hybridLayerPoints(nLayers) : null;
  const seen = new Set();
  const output = [];
  let hybridsEmitted = false;

  const push = (profile) => {
    if (!profile?.id || seen.has(profile.id)) return;
    seen.add(profile.id);
    output.push({ ...profile, args: [...(profile.args ?? [])] });
  };

  const emitHybrids = () => {
    if (hybridsEmitted) return;
    hybridsEmitted = true;
    if (!points || !vulkanTemplate) return;
    for (const n of points) push(cloneWithGpuLayers(vulkanTemplate, n, `hybrid-${n}`));
  };

  for (const profile of profiles) {
    if (isHybridProfile(profile)) {
      if (points) emitHybrids();
      else if (profile.id === 'hybrid-12' || !output.some(isHybridProfile)) push(profile);
      continue;
    }
    push(profile);
  }
  if (points && vulkanTemplate) emitHybrids();
  return output;
}

export { isCpuTemplate, isVulkanAllTemplate, isHybridProfile };
