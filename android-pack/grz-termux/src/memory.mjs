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

export function agentCanAdmit(agent, { freeMemoryBytes, includeDraft } = {}) {
  if (!agent || agent.runtime === 'logical') {
    return { ok: true, reason: 'logical', estimateBytes: null, headroomBytes: headroomBytes() };
  }
  const profiles = agent.profiles?.length ? agent.profiles : [{ id: 'default', args: [] }];
  const draft = includeDraft ?? Boolean(agent.draft_enabled && agent.draft_model);
  let admitted = null;
  let unknown = null;
  let impractical = null;
  for (const profile of profiles) {
    const admission = profileAdmitted(agent, profile, { freeMemoryBytes, includeDraft: draft });
    const tagged = { ...admission, profileId: profile.id };
    if (admission.ok && admission.reason === 'admitted') {
      if (!admitted) admitted = tagged;
    } else if (admission.ok) {
      if (!unknown) unknown = tagged;
    } else if (admission.reason === 'impractical') {
      if (!impractical || (admission.estimateBytes ?? 0) > (impractical.estimateBytes ?? 0)) impractical = tagged;
    }
  }
  if (admitted) return admitted;
  // A CPU-impractical specialist must not hop via Vulkan/"unknown" GPU just because those profiles skip the RAM check.
  if (impractical) return impractical;
  if (unknown) return unknown;
  return { ok: true, reason: 'unknown', estimateBytes: null, headroomBytes: headroomBytes() };
}

export { artifactSizeBytes, cpuResidentWeightBytes, profileKeepsWeightsOnCpu };
