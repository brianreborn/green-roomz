export const REQUIRED_ALIASES = Object.freeze([
  'vision-layout-agent',
  'audio-transcription-agent',
  'qwenstral-code-speculator',
  'general-text-speculator',
  'semantic-embedding-agent',
  'retrieval-rerank-agent',
  'tool-router-agent',
  'safety-policy-agent',
  'speech-synthesis-agent',
  'image-generation-agent',
  'security-monitor-agent',
]);

export const POLICIES = Object.freeze({
  responsive: { maxHeavyInFlight: 1, objective: 'interactive' },
  balanced: { maxHeavyInFlight: 2, objective: 'balanced' },
  maximize: { maxHeavyInFlight: Number.POSITIVE_INFINITY, objective: 'throughput' },
});

export const TRANSLATION_ALIAS = 'translation-agent';
export const DEFAULT_MANIFEST = new URL('../config/agents.windows.json', import.meta.url);

export const NEXUS_ALIAS = 'tool-router-agent';
export const MONITOR_ALIAS = 'security-monitor-agent';
export const FALLBACK_ALIAS = 'general-text-speculator';
export const MAX_SPECIALIST_HOPS = 2;
export const HANDOFF_PEEK_CHARS = 48;
export const NEXUS_MAX_TOKENS = 96;
