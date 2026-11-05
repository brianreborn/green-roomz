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
import { TIMING_PRIVACY_INSTALL_HINT, resolveTimingPrivacy } from './timing-quant.mjs';
import { digestObject, expandEnvironment, resolveManifestPath, nfcPath } from './util.mjs';
import os from 'node:os';
import { readFileSync, existsSync, lstatSync, realpathSync, openSync, fstatSync, closeSync, readlinkSync, constants as fsConstants } from 'node:fs';
import { assertNexusKernelText, kernelBindingIssues } from './kernel-text.mjs';

export { assertNexusKernelText, kernelBindingIssues };

const SECRET_FIELD = /(api[_-]?key|password|secret|token)$/i;

function requireInt(gateway, key, { min = 1 } = {}) {
  const n = Number(gateway[key]);
  if (!Number.isFinite(n) || n < min) return `gateway.${key} is required at install (integer >= ${min})`;
  return null;
}

function installGatewayIssues(gateway) {
  const issues = [];
  for (const key of [
    'max_warm_specialists',
    'session_limit',
    'session_ttl_ms',
    'upstream_timeout_ms',
    'request_timeout_ms',
    'nexus_consult_timeout_ms',
    'handoff_peek_timeout_ms',
    'handoff_peek_chars',
    'agent_chat_timeout_ms',
    'agent_max_tokens',
    'memory_transcript_chars',
    'memory_facts_limit',
  ]) {
    const hit = requireInt(gateway, key, { min: 1 });
    if (hit) issues.push(hit);
  }
  const idle = requireInt(gateway, 'idle_evict_ms', { min: 0 });
  if (idle) issues.push(idle);
  if (gateway.admit_when_tight !== 'refuse' && gateway.admit_when_tight !== 'page') {
    issues.push('gateway.admit_when_tight is required at install (refuse | page)');
  }
  if (typeof gateway.apply_store_winners !== 'boolean') {
    issues.push('gateway.apply_store_winners is required at install (false | true)');
  }
  if (!Array.isArray(gateway.health_aliases) || gateway.health_aliases.length < 1
      || gateway.health_aliases.some((a) => typeof a !== 'string' || !a.trim())) {
    issues.push('gateway.health_aliases is required at install (non-empty alias array)');
  }
  return issues;
}

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
    if (!resolveTimingPrivacy(manifest.gateway)) issues.push(TIMING_PRIVACY_INSTALL_HINT);
    issues.push(...installGatewayIssues(manifest.gateway));
    const healthAliases = manifest.gateway.health_aliases;
    if (Array.isArray(healthAliases)) {
      for (const alias of healthAliases) {
        if (!aliases.includes(alias)) issues.push(`gateway.health_aliases unknown alias: ${alias}`);
      }
    }
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
  if (!out.HOME && process.env.HOME) out.HOME = process.env.HOME;
  return out;
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

// Host override: an unlisted, setup-generated file in the user-state dir, never inside the
// versioned/hashed folder: $HOME/.green-roomz-state/<name>.local.json (dir 700, file 600).
// UNTRUSTED. Strict allowlist; never names a binary, library, model or args; no ${} expansion.
export const HOST_OVERRIDE_KEYS = Object.freeze(['port', 'api_key_file', 'log_opt_in']);
const OVERRIDE_FORBIDDEN = /(command|bin|binary|lib|library|ld_|model|draft|projector|args?|argv|exec|path|policy|kernel|env)/i;

export const HOST_STATE_DIRNAME = '.green-roomz-state';
export function hostOverridePath(manifestPath, env = process.env) {
  const home = homeOf(env);
  if (!home) return null;
  const base = P().basename(manifestPath).replace(/\.json$/i, '');
  return P().join(home, HOST_STATE_DIRNAME, `${base}.local.json`);
}

/** Read + validate the override at `file`. Returns null when absent. Throws ValidationError. */
export function readHostOverride(file, env = process.env) {
  if (!file) return null;
  let st;
  const dir = path.dirname(file);
  try {
    const ds = lstatSync(dir);
    if (ds.isSymbolicLink() || !ds.isDirectory()) throw new ValidationError('host override refused', { issues: [`state dir ${dir} is not a real directory`] });
    if (!isWin32() && (ds.mode & 0o077) !== 0) throw new ValidationError('host override refused', { issues: [`state dir ${dir} mode ${(ds.mode & 0o777).toString(8)} must be 700`] });
  } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  try { st = lstatSync(file); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  const issues = [];
  if (st.isSymbolicLink()) issues.push(`override ${file} is a symlink; refusing`);
  else if (!st.isFile()) issues.push(`override ${file} is not a regular file; refusing`);
  else {
    // P-1: POSIX mode bits are meaningless on win32 (Node reports 0o666/0o444); skip there.
    if (!isWin32() && (st.mode & 0o777) !== 0o600) issues.push(`override ${file} mode ${(st.mode & 0o777).toString(8)} must be 600`);
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) issues.push(`override ${file} owned by uid ${st.uid}, not ${process.getuid()}`);
  }
  if (issues.length) throw new ValidationError('host override refused', { issues });
  if (st.size > HOST_OVERRIDE_MAX_BYTES) throw new ValidationError('host override refused', { issues: [`override ${file} is ${st.size} bytes (cap ${HOST_OVERRIDE_MAX_BYTES})`] });
  const raw = readFileSync(file, 'utf8');
  if (Buffer.byteLength(raw) > HOST_OVERRIDE_MAX_BYTES) throw new ValidationError('host override refused', { issues: [`override ${file} exceeds ${HOST_OVERRIDE_MAX_BYTES} bytes`] });
  const dups = duplicateKeys(raw);
  if (dups.length) throw new ValidationError('host override refused', { issues: [`override ${file} has duplicate keys: ${dups.join(', ')}`] });
  let data;
  try { data = JSON.parse(raw); } catch (err) { throw new ValidationError('host override refused', { issues: [`override ${file}: ${err.message}`] }); }
  return validateHostOverride(data, env);
}

/** P-1: platform seam (tests set it via _setPlatformForTest). win32 has no POSIX mode bits:
 * mode checks are skipped and files must resolve under the user's profile (os.homedir()).
 * Real ACL checks (owner-only DACL) are planned for v0.3. */
let platformOverride = null; let homedirOverride = null; let fsOverride = null;
/** Test seam: platform, homedir, and optional { realpath, lstat } so win32 paths run on Linux. */
export function _setPlatformForTest(platform, homedir = null, fsFns = null) { platformOverride = platform; homedirOverride = homedir; fsOverride = fsFns; }
function isWin32() { return (platformOverride ?? process.platform) === 'win32'; }
function profileDir() { return homedirOverride ?? os.homedir(); }
/** P-1a: the home used for state + key checks: os.homedir() on win32 (HOME is usually unset
 * there), env.HOME on POSIX. */
function homeOf(env) { return isWin32() ? profileDir() : env?.HOME; }
function P() { return isWin32() ? path.win32 : path; }
function realpathX(p) { return (fsOverride?.realpath ?? realpathSync)(p); }
function lstatX(p) { return (fsOverride?.lstat ?? lstatSync)(p); }
let procfsHintLogged = false;
export const _keyPathIssuesForTest = (real, homeReal) => keyPathIssues(real, homeReal);
export function _resetProcfsHintForTest() { procfsHintLogged = false; }

/** Key content rule (shared with the note9 scripts and familia): one token, no \r, no \n,
 * no whitespace anywhere, incl. trailing newline. llama-server reads one key per line and does
 * not trim, so a stray \r would 401 every client. Setup writes with printf '%s'. */
export function apiKeyContentIssues(raw, file = 'api_key_file') {
  if (raw.length === 0) return [`api_key_file ${file} is empty`];
  if (raw.includes('\r')) return [`api_key_file ${file} contains \\r (CRLF); write it with printf '%s'`];
  if (raw.includes('\n')) return [`api_key_file ${file} contains a newline; write it with printf '%s' (one key, no trailing newline)`];
  if (/\s/u.test(raw)) return [`api_key_file ${file} contains whitespace; refusing`];
  return [];
}

const SHARED_PREFIX_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'shared-storage-prefixes.txt');
let sharedPrefixCache = null;
/** Shared-storage prefixes (config/shared-storage-prefixes.txt; same list the note9 scripts use). */
export function sharedStoragePrefixes() {
  if (!sharedPrefixCache) {
    sharedPrefixCache = Object.freeze(readFileSync(SHARED_PREFIX_FILE, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  }
  return sharedPrefixCache;
}
export function isSharedStorage(resolved) {
  return sharedStoragePrefixes().some((pre) => { const b = pre.replace(/\/+$/, ''); return resolved === b || resolved.startsWith(b + '/'); });
}

/** SD-21 path checks (no open). Primary: allowlist — realpath(key) must start with
 * realpath($HOME) + '/'; no package path is hard-coded, so $HOME reached through a symlinked
 * prefix (/data/user/0 -> /data/data) works. Secondary: shared-storage deny list. */
function keyPathIssues(real, homeReal) {
  if (isWin32()) {
    // P-1b: NTFS is case-insensitive and drive letters vary in case: compare only the
    // normalized, lowercased win32 forms (homeReal is realpath(os.homedir()) here).
    const norm = (x) => path.win32.normalize(x).replace(/[\\]+$/, '').toLowerCase();
    if (!norm(real).startsWith(norm(homeReal) + '\\')) return [`api_key_file ${real} is outside the user profile (${homeReal}); on Windows the key must live under the profile (ACL checks come in v0.3)`];
    return [];
  }
  if (!real.startsWith(homeReal + path.sep)) return [`api_key_file ${real} is outside $HOME (${homeReal})`];
  if (isSharedStorage(real)) return [`api_key_file ${real} is on shared storage; refusing`];
  return [];
}
export function apiKeyFileIssues(file, env = process.env) {
  let homeReal; let real;
  const home = homeOf(env);
  try { homeReal = realpathX(home); } catch { return [`api_key_file: ${isWin32() ? 'profile dir' : 'HOME'} ${home} does not resolve`]; }
  try { if (lstatX(file).isSymbolicLink()) return [`api_key_file ${file} is a symlink; refusing`]; } catch { return [`api_key_file ${file} does not exist`]; }
  try { real = realpathX(file); } catch { return [`api_key_file ${file} does not resolve`]; }
  return keyPathIssues(real, homeReal);
}

/** SD-21 single open: O_NOFOLLOW open, then fstat THAT fd (regular, 600/400, our uid) and read
 * through it. The fd's own path (/proc/self/fd) is re-checked against the allowlist/deny list. */
export function readApiKeyFile(file, env = process.env) {
  const pre = apiKeyFileIssues(file, env);
  if (pre.length) throw new ValidationError('api_key_file refused', { issues: pre });
  let fd;
  try { fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | (fsConstants.O_NONBLOCK ?? 0)); } catch (e) {
    throw new ValidationError('api_key_file refused', { issues: [e.code === 'ELOOP' ? `api_key_file ${file} is a symlink; refusing` : `api_key_file ${file}: ${e.code}`] });
  }
  try {
    const issues = [];
    const st = fstatSync(fd);
    if (!st.isFile()) issues.push(`api_key_file ${file} is not a regular file`);
    const mode = st.mode & 0o777;
    if (!isWin32() && mode !== 0o600 && mode !== 0o400) issues.push(`api_key_file ${file} mode ${mode.toString(8)} must be 600 or 400`);
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) issues.push(`api_key_file ${file} not owned by uid ${process.getuid()}`);
    if (st.size > HOST_OVERRIDE_MAX_BYTES) issues.push(`api_key_file ${file} is larger than ${HOST_OVERRIDE_MAX_BYTES} bytes`);
    let fdPath = null;
    if (!isWin32()) {
      try { fdPath = readlinkSync(`/proc/self/fd/${fd}`); } catch {
        // P-2: no procfs (FreeBSD default). realpath + fstat above still hold; say so once.
        if (!procfsHintLogged) { procfsHintLogged = true; console.warn('api_key_file: /proc/self/fd unavailable; fd path re-check skipped (realpath+fstat still enforced). On FreeBSD add "proc /proc procfs rw 0 0" to /etc/fstab and `mount /proc`.'); }
      }
    }
    if (fdPath && !issues.length) issues.push(...keyPathIssues(fdPath, realpathSync(homeOf(env))));
    if (issues.length) throw new ValidationError('api_key_file refused', { issues });
    const key = readFileSync(fd, 'utf8');
    const ci = apiKeyContentIssues(key, file);
    if (ci.length) throw new ValidationError('api_key_file refused', { issues: ci });
    return key;
  } finally { closeSync(fd); }
}

/** SD-27: duplicate keys counted AFTER decoding. A parse-tracking walk over the JSON text:
 * every object key token is decoded with JSON.parse (so "\u0070ort" and "port" are the same
 * key) and counted per object. Strings are skipped as whole tokens, so a "x": inside a value
 * is never mistaken for a key. Returns decoded duplicate key names. */
export function duplicateKeys(raw) {
  const dups = new Set(); const stack = []; let i = 0; let expectKey = false;
  const n = raw.length;
  while (i < n) {
    const c = raw[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && raw[j] !== '"') j += raw[j] === '\\' ? 2 : 1;
      const tok = raw.slice(i, j + 1); i = j + 1;
      const top = stack[stack.length - 1];
      if (top && top.type === 'obj' && expectKey) {
        const key = JSON.parse(tok);
        if (top.keys.has(key)) dups.add(key); else top.keys.add(key);
        expectKey = false;
      }
      continue;
    }
    if (c === '{') { stack.push({ type: 'obj', keys: new Set() }); expectKey = true; }
    else if (c === '[') { stack.push({ type: 'arr' }); expectKey = false; }
    else if (c === '}' || c === ']') { stack.pop(); expectKey = false; }
    else if (c === ',') { expectKey = stack[stack.length - 1]?.type === 'obj'; }
    i += 1;
  }
  return [...dups];
}

export const HOST_OVERRIDE_MAX_BYTES = 4096;
export function validateHostOverride(data, env = process.env) {
  const issues = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ValidationError('host override refused', { issues: ['override must be a JSON object'] });
  for (const [k, v] of Object.entries(data)) {
    if (!HOST_OVERRIDE_KEYS.includes(k)) {
      issues.push(OVERRIDE_FORBIDDEN.test(k) ? `override key ${k} names a binary/library/model/args; refusing` : `override key ${k} not allowed (allowed: ${HOST_OVERRIDE_KEYS.join(', ')})`);
      continue;
    }
    if (typeof v === 'string' && v.includes('${')) { issues.push(`override ${k}: \${} expansion not allowed`); continue; }
    if (k === 'port' && (!Number.isInteger(v) || v < 1024 || v > 65535)) issues.push('override port must be an integer 1024-65535');
    if (k === 'log_opt_in' && typeof v !== 'boolean') issues.push('override log_opt_in must be boolean');
    if (v !== null && typeof v === 'object') { issues.push(`override ${k} must be a scalar`); continue; }
    if (k === 'api_key_file') {
      if (typeof v !== 'string' || !P().isAbsolute(v) || /[\0\n]/.test(v)) issues.push('override api_key_file must be an absolute path');
      else if (!homeOf(env)) issues.push(isWin32() ? 'override api_key_file needs a user profile (os.homedir())' : 'override api_key_file needs HOME');
      else issues.push(...apiKeyFileIssues(v, env));
    }
  }
  if (issues.length) throw new ValidationError('host override refused', { issues });
  return Object.freeze({ ...data });
}

export async function loadManifest(input = DEFAULT_MANIFEST, env = process.env) {
  const root = packageRoot();
  const effectiveEnv = withDefaultGrzEnv(env, root);
  const manifestPath = nfcPath(input instanceof URL ? fileURLToPath(input) : path.resolve(input));
  let raw = await readFile(manifestPath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // UTF-8 BOM (PF8)
  const parsed = JSON.parse(raw);
  const override = readHostOverride(hostOverridePath(manifestPath, effectiveEnv), effectiveEnv);
  const manifest = expandEnvironment(parsed, effectiveEnv);
  // Applied after expansion: override values are literals, never expanded.
  if (override) process.stderr.write(`green-roomz: host override accepted keys: ${Object.keys(override).sort().join(', ') || '(none)'}\n`);
  if (override?.port !== undefined && manifest.gateway) manifest.gateway.port = override.port;
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
    value: Object.freeze({ path: manifestPath, digest: digestObject(parsed), packageRoot: root, hostOverride: override ?? null, hostHome: override ? effectiveEnv.HOME : null }),
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
