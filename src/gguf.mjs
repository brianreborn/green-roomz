/** Small GGUF header reader: architecture KVs, tensor index, optional hashes. No default weight dump. */
import { createHash } from 'node:crypto';
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

/** ggml type id → block size and on-disk block bytes (llama.cpp ggml-common.h). */
const GGML = {
  0: { name: 'f32', block: 1, bytes: 4, scalar: 'f32' },
  1: { name: 'f16', block: 1, bytes: 2, scalar: 'f16' },
  2: { name: 'q4_0', block: 32, bytes: 18 },
  3: { name: 'q4_1', block: 32, bytes: 20 },
  6: { name: 'q5_0', block: 32, bytes: 22 },
  7: { name: 'q5_1', block: 32, bytes: 24 },
  8: { name: 'q8_0', block: 32, bytes: 34 },
  9: { name: 'q8_1', block: 32, bytes: 36 },
  10: { name: 'q2_k', block: 256, bytes: 84 },
  11: { name: 'q3_k', block: 256, bytes: 110 },
  12: { name: 'q4_k', block: 256, bytes: 144 },
  13: { name: 'q5_k', block: 256, bytes: 176 },
  14: { name: 'q6_k', block: 256, bytes: 210 },
  15: { name: 'q8_k', block: 256, bytes: 292 },
  30: { name: 'bf16', block: 1, bytes: 2, scalar: 'bf16' },
};

/** llama.cpp general.file_type (LLAMA_FTYPE_*). */
const FILE_TYPE = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
  7: 'Q8_0',
  8: 'Q5_0',
  9: 'Q5_1',
  10: 'Q2_K',
  11: 'Q3_K_S',
  12: 'Q3_K_M',
  13: 'Q3_K_L',
  14: 'Q4_K_S',
  15: 'Q4_K_M',
  16: 'Q5_K_S',
  17: 'Q5_K_M',
  18: 'Q6_K',
  32: 'BF16',
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
  'general.alignment',
]);

function isInterestingKey(key) {
  if (INTEREST.has(key)) return true;
  return /\.(block_count|embedding_length|attention\.head_count|context_length)$/.test(key);
}

export function tensorNbytes(shape, dtypeId) {
  const spec = GGML[dtypeId];
  if (!spec || !Array.isArray(shape) || !shape.length) return null;
  let n = 1;
  for (const dim of shape) {
    if (!Number.isFinite(dim) || dim < 0) return null;
    n *= dim;
  }
  if (n % spec.block !== 0) return null;
  return (n / spec.block) * spec.bytes;
}

function hashRange(fd, start, length) {
  const hash = createHash('sha256');
  const buf = Buffer.alloc(Math.min(1024 * 1024, Math.max(length, 1)));
  let left = length;
  let pos = start;
  while (left > 0) {
    const n = Math.min(buf.length, left);
    const got = readSync(fd, buf, 0, n, pos);
    if (got <= 0) break;
    hash.update(buf.subarray(0, got));
    pos += got;
    left -= got;
  }
  if (left !== 0) return null;
  return hash.digest('hex');
}

function f16ToF32(h) {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h & 0x7C00) >> 10;
  const frac = h & 0x03FF;
  if (exp === 0) return sign * (2 ** -14) * (frac / 1024);
  if (exp === 31) return frac ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * (2 ** (exp - 15)) * (1 + frac / 1024);
}

function readScalarValues(fd, abs, nbytes, scalar) {
  const buf = Buffer.alloc(nbytes);
  const got = readSync(fd, buf, 0, nbytes, abs);
  if (got < nbytes) return null;
  const out = [];
  if (scalar === 'f32') {
    for (let i = 0; i < nbytes; i += 4) out.push(buf.readFloatLE(i));
  } else if (scalar === 'f16') {
    for (let i = 0; i < nbytes; i += 2) out.push(f16ToF32(buf.readUInt16LE(i)));
  } else if (scalar === 'bf16') {
    for (let i = 0; i < nbytes; i += 2) {
      const tmp = Buffer.alloc(4);
      tmp.writeUInt16LE(buf.readUInt16LE(i), 2);
      out.push(tmp.readFloatLE(0));
    }
  }
  return out;
}

const INFO_CACHE = new Map();

export function readGgufInfo(filePath, {
  maxTensors = 4096,
  tensors = true,
  hash = false,
  values = false,
  maxParams = 4096,
  tensorName = null,
} = {}) {
  let mtimeMs = 0;
  let size = 0;
  try {
    const st = statSync(filePath);
    mtimeMs = st.mtimeMs;
    size = st.size;
  } catch {
    return { format: 'unknown', size: 0 };
  }
  const cacheKey = [filePath, mtimeMs, size, tensors ? 1 : 0, maxTensors, hash ? 1 : 0, values ? 1 : 0, maxParams, tensorName ?? ''].join('\0');
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
    const all = [];
    if (tensors) {
      for (let i = 0; i < tensorCount; i += 1) {
        const name = readString(r);
        const nDims = r.u32();
        const shape = [];
        for (let d = 0; d < nDims; d += 1) shape.push(r.u64());
        const dtype = r.u32();
        const offset = r.u64();
        all.push({ name, shape, dtype, offset });
      }
    }
    const alignment = Number(kv['general.alignment']) > 0 ? Number(kv['general.alignment']) : 32;
    const dataStart = tensors ? ((r.pos + alignment - 1) & ~(alignment - 1)) : 0;
    let valuesRefused = null;
    const listed = {};
    const shown = all.slice(0, maxTensors);
    for (const tensor of shown) {
      const spec = GGML[tensor.dtype];
      const nbytes = tensorNbytes(tensor.shape, tensor.dtype);
      const row = {
        shape: tensor.shape,
        dtype: spec?.name ?? `type_${tensor.dtype}`,
      };
      const abs = dataStart + tensor.offset;
      if (hash && nbytes != null) row.sha256 = hashRange(fd, abs, nbytes);
      else if (hash) row.sha256 = null;
      const numel = tensor.shape.reduce((acc, dim) => acc * dim, 1);
      const selected = !tensorName || tensor.name === tensorName;
      if (values && selected) {
        if (numel > maxParams || !spec?.scalar || nbytes == null) {
          if (tensorName) valuesRefused = { tensor: tensor.name, max_params: maxParams, numel };
          else row.values_omitted = 'exceeds max_params or quantized';
        } else {
          row.values = readScalarValues(fd, abs, nbytes, spec.scalar);
        }
      }
      listed[tensor.name] = row;
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
      tensor_count: tensors ? tensorCount : 0,
      tensors_truncated: tensors ? tensorCount > shown.length : false,
      tensors: listed,
      values_refused: valuesRefused,
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
  return FILE_TYPE[info.file_type] ?? `type_${info.file_type}`;
}
