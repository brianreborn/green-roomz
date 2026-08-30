import os from 'node:os';
import {
  artifactSizeBytes,
  cpuResidentWeightBytes,
  profileKeepsWeightsOnCpu,
} from './process-manager.mjs';

const GiB = 1024 ** 3;
const HEADROOM_FLOOR_BYTES = 2 * GiB;
const PHONE_HEADROOM_BYTES = 256 * 1024 * 1024;
const CPU_RESIDENT_FACTOR = 1.6;
const CPU_RESIDENT_PAD_BYTES = 512 * 1024 * 1024;

/** 2 GiB on PCs; 256 MiB on phones so a 0.5B nexus can admit under ~3 GiB free. */
export function headroomBytes(totalMemoryBytes = os.totalmem()) {
  const total = Number(totalMemoryBytes);
  if (Number.isFinite(total) && total > 0 && total < 8 * GiB) return PHONE_HEADROOM_BYTES;
  return HEADROOM_FLOOR_BYTES;
}

export function estimateResidentBytes(agent, profile, { includeDraft } = {}) {
  if (!profileKeepsWeightsOnCpu(profile)) return null;
  const sized = includeDraft === false ? { ...agent, draft_enabled: false } : agent;
  const weights = cpuResidentWeightBytes(sized);
  if (weights == null) return null;
  return Math.round(weights * CPU_RESIDENT_FACTOR + CPU_RESIDENT_PAD_BYTES);
}

/**
 * A rough footprint for an agent regardless of profile - used to decide whether
 * a new specialist needs room made for it. GPU/Vulkan profiles still consume
 * host memory (shared VRAM on an APU, mmap'd weights everywhere), so we fall
 * back to model (+ projector + draft) file size when the CPU estimate is null.
 */
export function agentFootprintBytes(agent, { includeDraft = true } = {}) {
  const cpu = estimateResidentBytes(agent, { args: ['--device', 'none'] }, { includeDraft });
  if (cpu != null) return cpu;
  let bytes = artifactSizeBytes(agent?.model) ?? 0;
  const proj = artifactSizeBytes(agent?.projector);
  if (proj) bytes += proj;
  if (includeDraft && agent?.draft_enabled && agent?.draft_model) {
    bytes += artifactSizeBytes(agent.draft_model) ?? 0;
  }
  return bytes ? Math.round(bytes * 1.15 + CPU_RESIDENT_PAD_BYTES) : null;
}

/**
 * Admission is advisory, not a veto. mmap'd weights and KV are reclaimable —
 * the OS pages. We never refuse to load a model just because `free` RAM is low;
 * we only flag memory pressure so /health and logs can show a degraded run.
 * The one genuine stop is a missing/zero-byte model file (caught upstream as a
 * missing artifact, not here).
 */
export function profileAdmitted(agent, profile, { freeMemoryBytes, includeDraft } = {}) {
  const headroom = headroomBytes();
  const estimateBytes = estimateResidentBytes(agent, profile, { includeDraft });
  if (estimateBytes == null) {
    return { ok: true, estimateBytes: null, headroomBytes: headroom, reason: 'unknown', pressure: 'unknown' };
  }
  if (!Number.isFinite(freeMemoryBytes)) {
    return { ok: true, estimateBytes, headroomBytes: headroom, reason: 'unknown-free', pressure: 'unknown' };
  }
  if (estimateBytes + headroom <= freeMemoryBytes) {
    return { ok: true, estimateBytes, headroomBytes: headroom, reason: 'admitted', pressure: 'ok' };
  }
  // Load anyway; let the OS page. Report the pressure for observability.
  return { ok: true, estimateBytes, headroomBytes: headroom, reason: 'tight', pressure: 'tight' };
}

export function agentCanAdmit(agent, { freeMemoryBytes, includeDraft } = {}) {
  if (!agent || agent.runtime === 'logical') {
    return { ok: true, reason: 'logical', estimateBytes: null, headroomBytes: headroomBytes() };
  }
  const profiles = agent.profiles?.length ? agent.profiles : [{ id: 'default', args: [] }];
  const draft = includeDraft ?? Boolean(agent.draft_enabled && agent.draft_model);
  let admitted = null;
  let tight = null;
  let unknown = null;
  for (const profile of profiles) {
    const admission = profileAdmitted(agent, profile, { freeMemoryBytes, includeDraft: draft });
    const tagged = { ...admission, profileId: profile.id };
    if (admission.reason === 'admitted') { if (!admitted) admitted = tagged; }
    else if (admission.reason === 'tight') {
      if (!tight || (admission.estimateBytes ?? 0) < (tight.estimateBytes ?? Infinity)) tight = tagged;
    } else if (!unknown) unknown = tagged;
  }
  // Everything is admittable now; prefer a comfortable profile, else the tightest-fitting.
  return admitted ?? unknown ?? tight ?? { ok: true, reason: 'unknown', estimateBytes: null, headroomBytes: headroomBytes(), pressure: 'unknown' };
}

export { artifactSizeBytes, cpuResidentWeightBytes, profileKeepsWeightsOnCpu };
