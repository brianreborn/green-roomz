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
/** High-level role of green-roomz / green-agentz agency: switch specialist registers. */
export const AGENCY_ROLE = 'code-switching';
export const MONITOR_ALIAS = 'security-monitor-agent';
export const FALLBACK_ALIAS = 'general-text-speculator';
export const MAX_SPECIALIST_HOPS = 3;
export const HANDOFF_PEEK_CHARS = 48;
export const NEXUS_MAX_TOKENS = 96;
/** Consult abort; slow boxes fall back to the offline plan rather than hang the chat. */
export const NEXUS_CONSULT_TIMEOUT_MS = 25_000;
/**
 * Hard ceiling on any single upstream backend request (proxy + native paths).
 * A stalled llama.cpp must not pin a policy slot forever. Override per-manifest
 * with gateway.upstream_timeout_ms.
 */
export const UPSTREAM_TIMEOUT_MS = 180_000;
/** Peek/handoff hop ceiling — a stalled specialist stream must not wedge routing. */
export const HANDOFF_PEEK_TIMEOUT_MS = 20_000;
/** Cap on a buffered (non-streaming) upstream response we will read into memory. */
export const UPSTREAM_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

/**
 * Names for existing layers (not new runtimes):
 * green-beanz = microkernel (tool-router.md, resident 0.5B)
 * green-brainz = specialist kernels (other policies/*.md)
 * green-genez = heritable manifests (config/agents.*.json + KERNEL_BASENAME)
 */
export const KERNEL_BASENAME = Object.freeze({
  'vision-layout-agent': 'vision-layout.md',
  'audio-transcription-agent': 'audio-transcription.md',
  'qwenstral-code-speculator': 'code-structured.md',
  'general-text-speculator': 'general-text.md',
  'tool-router-agent': 'tool-router.md',
  'safety-policy-agent': 'safety.md',
  'image-generation-agent': 'image-generation.md',
  'security-monitor-agent': 'security-monitor.md',
});

/** Safety + monitor kernels stay off the nexus unless that alias is the task. */
export const CRITICAL_KERNEL_FILES = Object.freeze(['safety.md', 'security-monitor.md']);

/** Gateway object: only these keys. Other orchestrator shape needs a sysadmin schema bump. */
export const ORCHESTRATOR_BOUNDED_KEYS = Object.freeze([
  'host',
  'port',
  'policy',
  'request_body_limit_bytes',
  'cold_start_timeout_ms',
  'retry_initial_ms',
  'retry_max_ms',
  'retry_deadline_ms',
  'upstream_timeout_ms',
  'idle_evict_ms',
  'checkpoint_dir',
  'checkpoint_keep',
  'min_free_bytes',
  'suspend_evicted',
  'max_warm_specialists',
  'council_dir',
  'headers_timeout_ms',
  'request_timeout_ms',
  'session_ttl_ms',
  'session_limit',
  'cors_origins',
  'allow_peers',
]);

export const SYSADMIN_SCHEMA_ENV = 'GREEN_ROOMZ_SYSADMIN_SCHEMA';
export const MICROKERNEL_MAX_CHARS = 512;

/**
 * Gateway /faith: how we treat kernel probability weights.
 * In predictive-actor runtimes, kernel faith === confidence. In general they are not identical.
 */
export const FAITH_LEVELS = Object.freeze({
  low: { name: 'low', minAccept: 0.7, assign: 0.9 },
  medium: { name: 'medium', minAccept: 0, assign: 1 },
  high: { name: 'high', minAccept: 0.2, assign: 1.1 },
  xhigh: { name: 'xhigh', minAccept: 0.05, assign: 1.25 },
});

/** /confidence: declarative mood (CAN/MAY/WILL/SHALL/MUST). Not the kernel confidence field. */
export const CONFIDENCE_MOODS = Object.freeze({
  can: { mood: 'can', verb: 'can' },
  may: { mood: 'may', verb: 'may' },
  will: { mood: 'will', verb: 'will' },
  shall: { mood: 'shall', verb: 'shall' },
  must: { mood: 'must', verb: 'must' },
});

/** /fear sketch: caution about the unseen. Not inverted /faith and not /forget. */
export const FEAR_LEVELS = Object.freeze({
  low: { name: 'low', refuseBelow: 0 },
  medium: { name: 'medium', refuseBelow: 0.25 },
  high: { name: 'high', refuseBelow: 0.5 },
});

export const DEFAULT_FAITH = 'medium';
export const DEFAULT_CONFIDENCE_MOOD = 'will';
export const DEFAULT_FEAR = 'low';
export const REBUKE_OP = 'rebuke';
/** /yolo: operator hands off, ready to brake. Not a kernel change. Not /forget. */
export const YOLO_TOKEN = 'yolo';
