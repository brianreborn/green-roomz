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
      cors_origins: ['http://127.0.0.1'],
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
      agent('vision-layout-agent', { native_capabilities: ['text', 'image'], gateway_accepted_capabilities: ['text', 'image'], runtime: 'llama_server', port: 18181, model: '/tmp/missing-vision.gguf' }),
      agent('audio-transcription-agent', { native_capabilities: ['audio'], gateway_accepted_capabilities: ['audio'], runtime: 'whisper', port: 18182, model: '/tmp/missing-whisper.bin' }),
      agent('qwenstral-code-speculator', { native_capabilities: ['text', 'json', 'code'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18183, model: '/tmp/missing-code.gguf', profiles: [{ id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] }] }),
      agent('general-text-speculator', { native_capabilities: ['text', 'json', 'translation-on-request'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18184, model: '/tmp/missing-text.gguf', draft_model: '/tmp/missing-draft.gguf', draft_enabled: true, draft_optional: true, draft_type: 'draft-eagle3', required_artifacts: ['model'], optional_artifacts: ['draft_model'] }),
      agent('semantic-embedding-agent', { native_capabilities: ['text', 'embedding'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18185, model: '/tmp/missing-embed.gguf' }),
      agent('retrieval-rerank-agent', { native_capabilities: ['text', 'reranking'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18186, model: '/tmp/missing-rerank.gguf' }),
      agent('tool-router-agent', { native_capabilities: ['text', 'routing', 'json'], gateway_accepted_capabilities: ['text', 'image', 'audio'], runtime: 'llama_server', port: 18187, model: '/tmp/missing-router.gguf', context_size: 2048, resident: true, extra_args: ['--device', 'none', '--n-gpu-layers', '0', '--threads', '2', '--threads-batch', '2'] }),
      agent('safety-policy-agent', { native_capabilities: ['text', 'classification', 'json'], gateway_accepted_capabilities: ['text'], runtime: 'llama_server', port: 18188, model: '/tmp/missing-safety.gguf' }),
      agent('speech-synthesis-agent', { native_capabilities: ['text', 'audio-output'], gateway_accepted_capabilities: ['text'], runtime: 'piper', port: 18189, model: '/tmp/missing-voice.onnx' }),
      agent('image-generation-agent', { native_capabilities: ['text', 'image-output'], gateway_accepted_capabilities: ['text'], runtime: 'stable_diffusion', port: 18190, model: '/tmp/missing-sd.gguf' }),
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
