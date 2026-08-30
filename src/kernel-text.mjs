/**
 * Kernel-text guards: the microkernel size/leak bound and the per-alias
 * system_policy basename binding. Extracted from config.mjs so compile-prompt.mjs
 * can share them without a circular import. config.mjs re-exports for callers.
 */
import path from 'node:path';
import {
  KERNEL_BASENAME,
  CRITICAL_KERNEL_FILES,
  NEXUS_ALIAS,
  MONITOR_ALIAS,
  MICROKERNEL_MAX_CHARS,
} from './constants.mjs';
import { ValidationError } from './errors.mjs';

export const CRITICAL_MARKERS = Object.freeze([
  'Do not make authorization decisions',
  'Async mailbox only',
]);

export function kernelBindingIssues(agent) {
  const issues = [];
  const policy = agent?.system_policy;
  if (!policy) return issues;
  const base = path.basename(String(policy).replaceAll('\\', '/'));
  const expected = KERNEL_BASENAME[agent.alias];
  if (expected && base !== expected) {
    issues.push(`agent ${agent.alias} system_policy must be ${expected} (explicit green-brainz kernel), got ${base}`);
  }
  if (agent.alias === NEXUS_ALIAS && CRITICAL_KERNEL_FILES.includes(base)) {
    issues.push(`microkernel cannot bind critical kernel ${base}`);
  }
  if (agent.alias === MONITOR_ALIAS && base !== 'security-monitor.md') {
    issues.push('security-monitor-agent kernel is frozen to security-monitor.md');
  }
  return issues;
}

export function assertNexusKernelText(text) {
  const body = String(text ?? '');
  if (body.length > MICROKERNEL_MAX_CHARS) {
    throw new ValidationError('microkernel exceeds size bound', { length: body.length, max: MICROKERNEL_MAX_CHARS });
  }
  for (const marker of CRITICAL_MARKERS) {
    if (body.includes(marker)) throw new ValidationError('critical rules leaked into microkernel', { marker });
  }
  return body;
}
