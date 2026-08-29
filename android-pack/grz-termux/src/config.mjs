import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_ALIASES, POLICIES, TRANSLATION_ALIAS } from './constants.mjs';
import { ValidationError } from './errors.mjs';
import { digestObject, expandEnvironment, resolveManifestPath } from './util.mjs';

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

export function validateManifest(manifest) {
  const issues = [];
  if (manifest.schema_version !== 1) issues.push('schema_version must be 1');
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
  }

  const secretFields = findSecretFields(manifest);
  if (secretFields.length) issues.push(`secrets are prohibited in manifests: ${secretFields.join(', ')}`);
  if (issues.length) throw new ValidationError('Invalid Green-Roomz manifest', issues);
  return manifest;
}

export async function loadManifest(input = new URL('../config/agents.windows.json', import.meta.url), env = process.env) {
  // Auto-detect OS instead of manual prompting
  if (input && input.toString().endsWith('agents.windows.json')) {
    if (process.platform === 'android' || process.platform === 'linux') {
      console.log('📱 Auto-detected target machine configuration: note9 (Android/Linux)');
      input = new URL('../config/agents.json', import.meta.url);
    } else {
      console.log('🖥️  Auto-detected target machine configuration: shalom (Windows-Native)');
      input = new URL('../config/agents.windows.json', import.meta.url);
    }
  }
  const manifestPath = input instanceof URL ? fileURLToPath(input) : path.resolve(input);
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = expandEnvironment(JSON.parse(raw), env);
  validateManifest(manifest);
  for (const agent of manifest.agents) {
    for (const field of ['model', 'draft_model', 'projector', 'system_policy']) {
      if (agent[field]) agent[field] = resolveManifestPath(manifestPath, agent[field]);
    }
  }
  Object.defineProperty(manifest, '_meta', { value: Object.freeze({ path: manifestPath, digest: digestObject(JSON.parse(raw)) }), enumerable: false });
  return deepFreeze(manifest);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

