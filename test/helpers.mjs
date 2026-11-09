import { writeFileSync } from 'node:fs';
import { loadManifest, validateManifest } from '../src/config.mjs';

export function sampleManifest(overrides = {}) {
  return validateManifest({
    schema_version: 1,
    manifest_version: 'test',
    product: 'Green-Roomz',
    gateway: {
      host: '127.0.0.1',
      port: 18080,
      policy: 'maximize',
      request_body_limit_bytes: 1024 * 1024,
      cold_start_timeout_ms: 2000,
      retry_initial_ms: 10,
      retry_max_ms: 40,
      retry_deadline_ms: 200,
      session_ttl_ms: 60_000,
      session_limit: 8,
      memory_transcript_chars: 2048,
      memory_facts_limit: 8,
      cors_origins: ['http://127.0.0.1'],
      timing_privacy: 'off',
      max_warm_specialists: 8,
      idle_evict_ms: 300000,
      upstream_timeout_ms: 2000,
      request_timeout_ms: 2000,
      nexus_consult_timeout_ms: 25000,
      handoff_peek_timeout_ms: 20000,
      handoff_peek_chars: 48,
      agent_chat_timeout_ms: 2000,
      agent_max_tokens: 96,
      health_aliases: ['tool-router-agent', 'general-text-speculator'],
      admit_when_tight: 'refuse',
      apply_store_winners: false,
      ...overrides.gateway,
    },
    runtimes: {
      llama_server: { kind: 'llama-server', command: '/usr/bin/true', base_args: ['--host', '127.0.0.1'], env: {} },
      whisper: { kind: 'whisper-server', command: '/usr/bin/true', base_args: [], env: {} },
      piper: { kind: 'piper', command: '/usr/bin/true', base_args: [], env: {} },
      stable_diffusion: { kind: 'stable-diffusion', command: '/usr/bin/true', base_args: [], env: {} },
      ...overrides.runtimes,
    },
    agents: overrides.agents ?? [
      agent('vision-layout-agent', { native_capabilities: ['text', 'image'], gateway_accepted_capabilities: ['text', 'image'], runtime: 'llama_server', port: 18181, model: '/nonexistent/grz/missing-vision.gguf' }),
      agent('audio-transcription-agent', { native_capabilities: ['audio'], gateway_accepted_capabilities: ['audio'], runtime: 'whisper', port: 18182, model: '/nonexistent/grz/missing-whisper.bin' }),
      agent('qwenstral-code-speculator', { native_capabilities: ['text', 'json', 'code'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18183, model: '/nonexistent/grz/missing-code.gguf', profiles: [{ id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] }] }),
      agent('general-text-speculator', { native_capabilities: ['text', 'json', 'translation-on-request'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18184, model: '/nonexistent/grz/missing-text.gguf', draft_model: '/nonexistent/grz/missing-draft.gguf', draft_enabled: true, draft_optional: true, draft_type: 'draft-eagle3', required_artifacts: ['model'], optional_artifacts: ['draft_model'] }),
      agent('semantic-embedding-agent', { native_capabilities: ['text', 'embedding'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18185, model: '/nonexistent/grz/missing-embed.gguf' }),
      agent('retrieval-rerank-agent', { native_capabilities: ['text', 'reranking'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18186, model: '/nonexistent/grz/missing-rerank.gguf' }),
      agent('tool-router-agent', { native_capabilities: ['text', 'routing', 'json'], gateway_accepted_capabilities: ['text', 'image', 'audio'], runtime: 'llama_server', port: 18187, model: '/nonexistent/grz/missing-router.gguf', context_size: 2048, resident: true, extra_args: ['--device', 'none', '--n-gpu-layers', '0', '--threads', '2', '--threads-batch', '2'] }),
      agent('safety-policy-agent', { native_capabilities: ['text', 'classification', 'json'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18188, model: '/nonexistent/grz/missing-safety.gguf' }),
      agent('speech-synthesis-agent', { native_capabilities: ['text', 'audio-output'], gateway_accepted_capabilities: ['text'], runtime: 'piper', port: 18189, model: '/nonexistent/grz/missing-voice.onnx' }),
      agent('image-generation-agent', { native_capabilities: ['text', 'image-output'], gateway_accepted_capabilities: ['text'], runtime: 'stable_diffusion', port: 18190, model: '/nonexistent/grz/missing-sd.gguf' }),
      agent('security-monitor-agent', { native_capabilities: ['text', 'json'], gateway_accepted_capabilities: ['text'], runtime: 'logical' }),
    ],
  });
}

function agent(alias, extra) {
  return {
    alias,
    description: alias,
    native_capabilities: ['text'],
    gateway_accepted_capabilities: ['text'],
    required_artifacts: extra.runtime === 'logical' ? [] : ['model'],
    profiles: extra.profiles ?? [],
    ...extra,
  };
}

export { loadManifest };

export function writeGgufBlockCount(filePath, n, { key = 'qwen2.block_count', prefixKey } = {}) {
  const chunks = [Buffer.from('GGUF')];
  const u32 = (value) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value);
    return buf;
  };
  const u64 = (value) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(value));
    return buf;
  };
  const str = (value) => {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([u64(bytes.length), bytes]);
  };
  const kvs = [];
  if (prefixKey) {
    kvs.push(Buffer.concat([str(prefixKey), u32(8), str('qwen2')]));
  }
  kvs.push(Buffer.concat([str(key), u32(4), u32(n)]));
  chunks.push(u32(3), u64(0), u64(kvs.length), ...kvs);
  writeFileSync(filePath, Buffer.concat(chunks));
}


function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

/** Tiny structurally-valid PNG ending at IEND (header-only fixture). */
export function tinyPng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = Buffer.from([0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0xff, 0x3f, 0x00, 0x05, 0xfe, 0x02, 0xfe]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/** Tiny WAV with matching RIFF size (header-only, zero data). */
export function tinyWav() {
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(0, 40);
  return wav;
}
