/** Structured self-report. Registry + GGUF header are copied; missing fields stay null. */
import { existsSync } from 'node:fs';
import { readGgufInfo } from './gguf.mjs';

const KEYS = [
  'architecture',
  'num_layers',
  'num_heads',
  'hidden_size',
  'context_length',
  'total_params',
  'quantization',
  'checkpoint_path',
  'notes',
];

export function isIntrospectionProbe(text) {
  const hay = String(text ?? '').toLowerCase();
  if (!hay.includes('json')) return false;
  let hits = 0;
  for (const key of KEYS) if (hay.includes(key)) hits += 1;
  return hits >= 4;
}

function parameterCount(info) {
  if (!info || info.format !== 'gguf' || info.tensors_truncated) return null;
  const tensors = info.tensors ?? {};
  const names = Object.keys(tensors);
  if (!names.length) return null;
  let sum = 0;
  for (const name of names) {
    const shape = tensors[name]?.shape;
    if (!Array.isArray(shape) || !shape.length) return null;
    let n = 1;
    for (const dim of shape) {
      if (!Number.isFinite(dim)) return null;
      n *= dim;
    }
    sum += n;
  }
  return sum;
}

export function introspectionFacts(record) {
  const checkpoint = record?.checkpoint_path ?? null;
  const info = checkpoint && existsSync(checkpoint) ? readGgufInfo(checkpoint, { tensors: true, hash: false }) : null;
  return {
    architecture: record?.architecture ?? info?.architecture ?? null,
    num_layers: record?.num_layers ?? info?.num_layers ?? null,
    num_heads: record?.num_heads ?? info?.num_heads ?? null,
    hidden_size: record?.hidden_size ?? info?.hidden_size ?? null,
    context_length: record?.max_model_len ?? info?.context_length ?? null,
    total_params: parameterCount(info),
    quantization: record?.quantization ?? null,
    checkpoint_path: checkpoint,
    notes: 'In-band JSON is a copy of registry and GGUF header fields this process already has. Unknown fields are null. GET /v1/models/{id} and GET /v1/weights are the source of truth.',
  };
}
