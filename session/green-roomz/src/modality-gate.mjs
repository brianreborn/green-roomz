import { ValidationError } from './errors.mjs';

// BND-03: request-time capability gate. Manifest vocab (config/agents.windows.json):
// detected modality `image` -> gateway_accepted_capabilities `image`, `audio` -> `audio`.
// Text-only turns are never blocked here (audio-transcription accepts no `text`).
const MODALITY_CAPABILITY = Object.freeze({ image: 'image', audio: 'audio' });

const REQUIRED_PART = Object.freeze({
  'vision-layout-agent': 'image',
  'audio-transcription-agent': 'audio',
});

// Non-chat gateway endpoints must reach an agent that natively serves them.
const ENDPOINT_NATIVE = Object.freeze({
  '/v1/embeddings': 'embedding',
  '/v1/rerank': 'reranking',
});

export function modalityGateViolation(agent, modality = {}) {
  if (!agent) return 'unknown agent';
  const alias = agent.alias;
  if (modality.image && modality.audio) return 'mixed image and audio input requires an explicitly qualified workflow';
  const required = REQUIRED_PART[alias];
  if (required && !modality[required]) return `${alias} requires an ${required} part (${required === 'image' ? 'vision without image part' : 'audio without audio part'})`;
  const accepted = Array.isArray(agent.gateway_accepted_capabilities) ? agent.gateway_accepted_capabilities : [];
  for (const [kind, capability] of Object.entries(MODALITY_CAPABILITY)) {
    if (modality[kind] && !accepted.includes(capability)) return `${alias} does not accept ${kind} input`;
  }
  return null;
}

export function endpointGateViolation(agent, pathname) {
  const need = ENDPOINT_NATIVE[pathname];
  if (!need) return null;
  const native = Array.isArray(agent?.native_capabilities) ? agent.native_capabilities : [];
  return native.includes(need) ? null : `${agent?.alias ?? 'agent'} does not serve ${pathname}`;
}

export function assertModalityGate(agent, modality, pathname) {
  const violation = modalityGateViolation(agent, modality) ?? (pathname ? endpointGateViolation(agent, pathname) : null);
  if (violation) {
    throw new ValidationError(`Capability gate: ${violation}`, {
      alias: agent?.alias ?? null,
      modalities: Object.keys(modality ?? {}).filter((key) => modality[key]),
    });
  }
}
