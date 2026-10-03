import {
  artifactSizeBytes,
  cpuResidentWeightBytes,
  profileKeepsWeightsOnCpu,
} from './process-manager.mjs';

const GiB = 1024 ** 3;
const HEADROOM_FLOOR_BYTES = 2 * GiB;
const CPU_RESIDENT_FACTOR = 1.6;
const CPU_RESIDENT_PAD_BYTES = 512 * 1024 * 1024;

export function headroomBytes(_totalMemoryBytes) {
  return HEADROOM_FLOOR_BYTES;
}

export function estimateResidentBytes(agent, profile, { includeDraft } = {}) {
  if (!profileKeepsWeightsOnCpu(profile)) return null;
  const sized = includeDraft === false ? { ...agent, draft_enabled: false } : agent;
  const weights = cpuResidentWeightBytes(sized);
  if (weights == null) return null;
  return Math.round(weights * CPU_RESIDENT_FACTOR + CPU_RESIDENT_PAD_BYTES);
}

export function profileAdmitted(agent, profile, { freeMemoryBytes, includeDraft } = {}) {
  const headroom = headroomBytes();
  const estimateBytes = estimateResidentBytes(agent, profile, { includeDraft });
  if (estimateBytes == null) {
    return { ok: true, estimateBytes: null, headroomBytes: headroom, reason: 'unknown' };
  }
  if (!Number.isFinite(freeMemoryBytes)) {
    return { ok: true, estimateBytes, headroomBytes: headroom, reason: 'unknown-free' };
  }
  if (estimateBytes + headroom <= freeMemoryBytes) {
    return { ok: true, estimateBytes, headroomBytes: headroom, reason: 'admitted' };
  }
  return {
    ok: false,
    estimateBytes,
    headroomBytes: headroom,
    reason: 'impractical',
  };
}

export { artifactSizeBytes, cpuResidentWeightBytes, profileKeepsWeightsOnCpu };
