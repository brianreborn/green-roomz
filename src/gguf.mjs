/** Small GGUF header reader: architecture KVs + tensor index. No weight payload. */
import { closeSync, openSync, readSync, statSync } from 'node:fs';

const VALUE = {
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

const TENSOR_DTYPE = {
  0: 'f32',
  1: 'f16',
  2: 'q4_0',
  3: 'q4_1',
  6: 'q5_0',
  7: 'q5_1',
  8: 'q8_0',
  9: 'q8_1',
  10: 'q2_k',
  11: 'q3_k',
  12: 'q4_k',
  13: 'q5_k',
  14: 'q6_k',
  15: 'q8_k',
  30: 'bf16',
};

function reader(fd) {
  let pos = 0;
  const read = (n) => {
    const buf = Buffer.alloc(n);
    const got = readSync(fd, buf, 0, n, pos);
    if (got < n) throw new Error('truncated GGUF');
    pos += n;
    return buf;
  };
  return {
    u32: () => read(4).readUInt32LE(0),
    i32: () => read(4).readInt32LE(0),
    u64: () => Number(read(8).readBigUInt64LE(0)),
    f32: () => read(4).readFloatLE(0),
    f64: () => read(8).readDoubleLE(0),
    bytes: (n) => read(n),
    skip: (n) => { pos += n; },
    get pos() { return pos; },
  };
}

function readString(r) {
  const n = r.u64();
  if (n > 1_000_000) throw new Error('GGUF string too large');
  return r.bytes(n).toString('utf8');
}

function skipValue(r, type) {
  switch (type) {
    case VALUE.UINT8:
    case VALUE.INT8:
    case VALUE.BOOL:
      r.skip(1); return;
    case VALUE.UINT16:
    case VALUE.INT16:
      r.skip(2); return;
    case VALUE.UINT32:
    case VALUE.INT32:
    case VALUE.FLOAT32:
      r.skip(4); return;
    case VALUE.UINT64:
    case VALUE.INT64:
    case VALUE.FLOAT64:
      r.skip(8); return;
    case VALUE.STRING:
      r.skip(r.u64()); return;
    case VALUE.ARRAY: {
      const item = r.u32();
      const count = r.u64();
      for (let i = 0; i < count; i += 1) skipValue(r, item);
      return;
    }
    default:
      throw new Error(`unsupported GGUF value type ${type}`);
  }
}

function readScalar(r, type) {
  switch (type) {
    case VALUE.UINT8: return r.bytes(1).readUInt8(0);
    case VALUE.INT8: return r.bytes(1).readInt8(0);
    case VALUE.UINT16: return r.bytes(2).readUInt16LE(0);
    case VALUE.INT16: return r.bytes(2).readInt16LE(0);
    case VALUE.UINT32: return r.u32();
    case VALUE.INT32: return r.i32();
    case VALUE.FLOAT32: return r.f32();
    case VALUE.BOOL: return r.bytes(1).readUInt8(0) !== 0;
    case VALUE.STRING: return readString(r);
    case VALUE.UINT64: return r.u64();
    case VALUE.INT64: return Number(r.bytes(8).readBigInt64LE(0));
    case VALUE.FLOAT64: return r.f64();
    default:
      skipValue(r, type);
      return undefined;
  }
}

const INTEREST = new Set([
  'general.architecture',
  'general.file_type',
  'general.name',
]);

function isInterestingKey(key) {
  if (INTEREST.has(key)) return true;
  return /\.(block_count|embedding_length|attention\.head_count|context_length)$/.test(key);
}

const INFO_CACHE = new Map();

export function readGgufInfo(filePath, { maxTensors = 4096, tensors = true } = {}) {
  let mtimeMs = 0;
  let size = 0;
  try {
    const st = statSync(filePath);
    mtimeMs = st.mtimeMs;
    size = st.size;
  } catch {
    return { format: 'unknown', size: 0 };
  }
  const cacheKey = `${filePath}\0${mtimeMs}\0${size}\0${tensors ? 1 : 0}\0${maxTensors}`;
  if (INFO_CACHE.has(cacheKey)) return INFO_CACHE.get(cacheKey);
  const fd = openSync(filePath, 'r');
  try {
    const r = reader(fd);
    const magic = r.bytes(4).toString('utf8');
    if (magic !== 'GGUF') return { format: 'unknown', size };
    const version = r.u32();
    const tensorCount = r.u64();
    const kvCount = r.u64();
    const kv = {};
    for (let i = 0; i < kvCount; i += 1) {
      const key = readString(r);
      const type = r.u32();
      if (isInterestingKey(key) && type !== VALUE.ARRAY) kv[key] = readScalar(r, type);
      else skipValue(r, type);
    }
    const listed = {};
    if (tensors) {
      const n = Math.min(tensorCount, maxTensors);
      for (let i = 0; i < n; i += 1) {
        const name = readString(r);
        const nDims = r.u32();
        const shape = [];
        for (let d = 0; d < nDims; d += 1) shape.push(r.u64());
        const dtype = r.u32();
        r.u64();
        listed[name] = { shape, dtype: TENSOR_DTYPE[dtype] ?? `type_${dtype}` };
      }
    }
    const architecture = kv['general.architecture'] ?? null;
    const prefix = architecture ? `${architecture}.` : '';
    const info = {
      format: 'gguf',
      version,
      size,
      architecture,
      name: kv['general.name'] ?? null,
      file_type: kv['general.file_type'] ?? null,
      num_layers: kv[`${prefix}block_count`] ?? null,
      hidden_size: kv[`${prefix}embedding_length`] ?? null,
      num_heads: kv[`${prefix}attention.head_count`] ?? null,
      context_length: kv[`${prefix}context_length`] ?? null,
      tensors: listed,
    };
    INFO_CACHE.set(cacheKey, info);
    return info;
  } catch {
    return { format: 'unknown', size };
  } finally {
    closeSync(fd);
  }
}

export function quantizationLabel(info) {
  if (!info || info.format !== 'gguf') return null;
  if (info.file_type == null) return null;
  return String(info.file_type);
}
