import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_ALIASES,
  POLICIES,
  TRANSLATION_ALIAS,
  KERNEL_BASENAME,
  CRITICAL_KERNEL_FILES,
  ORCHESTRATOR_BOUNDED_KEYS,
  SYSADMIN_SCHEMA_ENV,
  NEXUS_ALIAS,
  MONITOR_ALIAS,
  MICROKERNEL_MAX_CHARS,
  DEFAULT_MANIFEST,
} from './constants.mjs';
import { ValidationError } from './errors.mjs';
import { digestObject, expandEnvironment, resolveManifestPath, nfcPath } from './util.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { assertNexusKernelText, kernelBindingIssues } from './kernel-text.mjs';

export { assertNexusKernelText, kernelBindingIssues };

const SECRET_FIELD = /(api[_-]?key|password|secret|token)$/i;

function findSecretFields(value, location = '$', found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (SECRET_FIELD.test(key)) found.push(childLocation);
    findSecretFields(child, childLocation, found);
  }
  return found;
}

export function validateManifest(manifest, env = process.env) {
  const issues = [];
  if (manifest.schema_version !== 1) {
    const allowed = String(env?.[SYSADMIN_SCHEMA_ENV] ?? '');
    if (allowed !== String(manifest.schema_version)) {
      issues.push(`schema_version ${manifest.schema_version} requires sysadmin ${SYSADMIN_SCHEMA_ENV}=${manifest.schema_version}`);
    }
  }
  if (!manifest.manifest_version) issues.push('manifest_version is required');
  if (!Array.isArray(manifest.agents)) issues.push('agents must be an array');

  const aliases = (manifest.agents ?? []).map((agent) => agent.alias);
  const duplicates = aliases.filter((alias, index) => aliases.indexOf(alias) !== index);
  if (duplicates.length) issues.push(`duplicate aliases: ${[...new Set(duplicates)].join(', ')}`);
  for (const required of REQUIRED_ALIASES) {
    if (!aliases.includes(required)) issues.push(`missing required alias: ${required}`);
  }
  if (aliases.includes(TRANSLATION_ALIAS)) issues.push('translation-agent is prohibited; translation is an explicit shared capability');
  if (!POLICIES[manifest.gateway?.policy]) issues.push('gateway.policy must be responsive, balanced, or maximize');
  if (manifest.gateway && typeof manifest.gateway === 'object') {
    const extra = Object.keys(manifest.gateway).filter((key) => !ORCHESTRATOR_BOUNDED_KEYS.includes(key));
    if (extra.length) issues.push(`gateway has unbounded keys (sysadmin schema bump required): ${extra.join(', ')}`);
  }

  const runtimeNames = new Set(Object.keys(manifest.runtimes ?? {}));
  const ports = new Map();
  for (const agent of manifest.agents ?? []) {
    if (!agent.alias || !Array.isArray(agent.native_capabilities) || !Array.isArray(agent.gateway_accepted_capabilities)) {
      issues.push(`agent ${agent.alias ?? '<unknown>'} has invalid capability declarations`);
    }
    if (agent.runtime !== 'logical' && !runtimeNames.has(agent.runtime)) issues.push(`agent ${agent.alias} references unknown runtime ${agent.runtime}`);
    if (agent.port) {
      if (ports.has(agent.port)) issues.push(`agents ${ports.get(agent.port)} and ${agent.alias} share port ${agent.port}`);
      ports.set(agent.port, agent.alias);
    }
    if (['qwenstral-code-speculator', 'general-text-speculator'].includes(agent.alias) && agent.projector) issues.push(`text-only agent ${agent.alias} cannot declare a projector`);
    issues.push(...kernelBindingIssues(agent));
  }

  const secretFields = findSecretFields(manifest);
  if (secretFields.length) issues.push(`secrets are prohibited in manifests: ${secretFields.join(', ')}`);
  if (issues.length) throw new ValidationError('Invalid Green-Roomz manifest', issues);
  return manifest;
}


/** Only the agent's declared system_policy. Never concatenates other kernels. */
export function loadDeclaredKernel(agent) {
  const policyPath = agent?.system_policy;
  if (!policyPath || !existsSync(policyPath)) return null;
  const text = readFileSync(policyPath, 'utf8');
  if (agent.alias === NEXUS_ALIAS) assertNexusKernelText(text);
  return text;
}

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/** Default GRZ_ROOT / GRZ_EXE / GRZ_LLAMA for portable manifests (PF2/PF3/PF4). */
export function withDefaultGrzEnv(env = process.env, root = packageRoot()) {
  const out = { ...env };
  if (!out.GRZ_ROOT) out.GRZ_ROOT = root;
  if (out.GRZ_EXE === undefined || out.GRZ_EXE === null) {
    out.GRZ_EXE = process.platform === 'win32' ? '.exe' : '';
  }
  if (!out.GRZ_LLAMA) {
    out.GRZ_LLAMA = path.join(out.GRZ_ROOT, 'runtime', `llama-server${out.GRZ_EXE || ''}`);
  }
  // PF-M8: only inherit process HOME when key absent; empty string stays empty (fail closed on expand).
  if (!Object.hasOwn(out, 'HOME') && process.env.HOME) out.HOME = process.env.HOME;
  return out;
}

/** True when empty/unset HOME expanded ${HOME}/grz-runtime → /grz-runtime (PF-M8). */
function isCollapsedHomeGrzPath(value) {
  const s = String(value ?? '');
  if (s === '/grz-runtime' || s.startsWith('/grz-runtime/') || s.startsWith('/grz-runtime:')) return true;
  // LD_LIBRARY_PATH-style: ...:/grz-runtime/... or leading /grz-runtime
  return /(^|:)\/grz-runtime(\/|:|$)/.test(s);
}

function assertRuntimeCommands(manifest) {
  const issues = [];
  for (const [name, runtime] of Object.entries(manifest.runtimes ?? {})) {
    const cmd = runtime?.command;
    if (cmd == null || String(cmd).trim() === '') {
      issues.push(`runtime ${name}: empty command path after expand (fail closed)`);
      continue;
    }
    if (/\$\{/.test(String(cmd))) {
      issues.push(`runtime ${name}: unresolved \${} in command (fail closed)`);
    }
    // Collapsed empty GRZ_ROOT historically produced "/runtime/llama-server"
    if (String(cmd) === '/runtime/llama-server' || String(cmd).startsWith('/runtime/llama-server')) {
      issues.push(`runtime ${name}: command collapsed to ${cmd} (unset GRZ_ROOT); fail closed`);
    }
    // PF-M8: empty/unset HOME → "${HOME}/grz-runtime/…" becomes "/grz-runtime/…"
    if (isCollapsedHomeGrzPath(cmd)) {
      issues.push(`runtime ${name}: command collapsed to ${cmd} (empty/unset HOME); fail closed`);
    }
    if (runtime.env && typeof runtime.env === 'object') {
      for (const [k, v] of Object.entries(runtime.env)) {
        if (typeof v === 'string' && isCollapsedHomeGrzPath(v)) {
          issues.push(`runtime ${name}: env ${k} collapsed to ${v} (empty/unset HOME); fail closed`);
        }
      }
    }
  }
  for (const agent of manifest.agents ?? []) {
    for (const field of ['model', 'draft_model', 'projector', 'system_policy']) {
      const v = agent?.[field];
      if (typeof v === 'string' && isCollapsedHomeGrzPath(v)) {
        issues.push(`agent ${agent.alias ?? '<unknown>'}.${field} collapsed to ${v} (empty/unset HOME); fail closed`);
      }
    }
  }
  if (issues.length) throw new ValidationError('Invalid Green-Roomz manifest runtime commands', issues);
}

function joinExpandedPath(value) {
  if (value == null || value === '') return value;
  // Normalize mixed separators after expand (PF2 P4) without breaking UNC / drive paths.
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return path.normalize(value);
  }
  if (path.isAbsolute(value)) return path.normalize(value);
  return path.normalize(value);
}

export async function loadManifest(input = DEFAULT_MANIFEST, env = process.env) {
  const root = packageRoot();
  const effectiveEnv = withDefaultGrzEnv(env, root);
  const manifestPath = nfcPath(input instanceof URL ? fileURLToPath(input) : path.resolve(input));
  let raw = await readFile(manifestPath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // UTF-8 BOM (PF8)
  const parsed = JSON.parse(raw);
  const manifest = expandEnvironment(parsed, effectiveEnv);
  assertRuntimeCommands(manifest);
  validateManifest(manifest, effectiveEnv);
  for (const agent of manifest.agents) {
    for (const field of ['model', 'draft_model', 'projector', 'system_policy']) {
      if (agent[field]) {
        agent[field] = nfcPath(joinExpandedPath(resolveManifestPath(manifestPath, agent[field])));
      }
    }
  }
  for (const runtime of Object.values(manifest.runtimes ?? {})) {
    if (runtime.command) {
      runtime.command = nfcPath(joinExpandedPath(resolveManifestPath(manifestPath, runtime.command)));
    }
    if (runtime.env && typeof runtime.env === 'object') {
      for (const [k, v] of Object.entries(runtime.env)) {
        if (typeof v === 'string' && (k.includes('PATH') || k.includes('DIR') || /path/i.test(k))) {
          runtime.env[k] = joinExpandedPath(v);
        }
      }
    }
  }
  expandVariants(manifest, manifestPath);
  const nexus = manifest.agents.find((agent) => agent.alias === NEXUS_ALIAS);
  if (nexus?.system_policy) loadDeclaredKernel(nexus);
  Object.defineProperty(manifest, '_meta', {
    value: Object.freeze({ path: manifestPath, digest: digestObject(parsed), packageRoot: root }),
    enumerable: false,
  });
  return deepFreeze(manifest);
}

/**
 * Expand `agent.variants` into concrete agents. The base alias serves the
 * `default_variant` (or the first variant, or its own `model`); each other
 * variant becomes `<alias>@<id>` - same routing/policy/capabilities/profiles,
 * different model/projector/port. Council mode runs several at once, so they
 * need distinct ports.
 */
export function expandVariants(manifest, manifestPath) {
  const extra = [];
  for (const agent of manifest.agents) {
    const variants = agent.variants;
    if (!Array.isArray(variants) || !variants.length) continue;
    const resolve = (v) => ({
      ...v,
      model: v.model ? resolveManifestPath(manifestPath, v.model) : agent.model,
      projector: v.projector ? resolveManifestPath(manifestPath, v.projector) : (v.model ? undefined : agent.projector),
      draft_model: v.draft_model ? resolveManifestPath(manifestPath, v.draft_model) : undefined,
    });
    const defId = agent.default_variant ?? variants[0].id;
    const portBase = agent.variant_port_base ?? (Number(agent.port) + 100);
    let n = 0;
    agent.variant_ids = variants.map((v) => v.id);
    agent.default_variant = defId;
    for (const raw of variants) {
      const v = resolve(raw);
      if (v.id === defId) {
        agent.model = v.model;
        if (v.projector !== undefined) agent.projector = v.projector;
        if (v.draft_model) agent.draft_model = v.draft_model;
        agent.active_variant = v.id;
        continue;
      }
      extra.push({
        ...structuredClone({ ...agent, variants: undefined }),
        alias: `${agent.alias}@${v.id}`,
        variant_of: agent.alias,
        active_variant: v.id,
        model: v.model,
        projector: v.projector ?? null,
        draft_model: v.draft_model ?? undefined,
        port: v.port ?? (portBase + n++),
        pinned: agent.pinned,
      });
    }
  }
  manifest.agents.push(...extra);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
