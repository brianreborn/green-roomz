import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, readHostOverride, validateHostOverride, hostOverridePath } from '../src/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'config', 'agents.note9.json');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function home(override, { mode = 0o600, dirMode = 0o700 } = {}) {
  const h = mkdtempSync(join(tmpdir(), 'grz-ovr-')); const st = join(h, '.green-roomz-state');
  mkdirSync(st); chmodSync(st, dirMode);
  const f = join(st, 'agents.note9.local.json');
  if (override !== undefined) { writeFileSync(f, JSON.stringify(override)); chmodSync(f, mode); }
  return { h, st, f };
}
const refused = (fn, re) => assert.throws(fn, (e) => re.test(JSON.stringify(e.details ?? e.message)));

test('OVR: path is $HOME/.green-roomz-state/<name>.local.json (outside the versioned folder)', () => {
  assert.equal(hostOverridePath('/x/grz.current/tree/config/agents.note9.json', { HOME: '/h' }), '/h/.green-roomz-state/agents.note9.local.json');
});
test('OVR: allowlisted port applies; verified base file sha unchanged', async () => {
  const { h } = home({ port: 8099, log_opt_in: false });
  const before = sha(BASE);
  const m = await loadManifest(BASE, { ...process.env, HOME: h });
  assert.equal(m.gateway.port, 8099);
  assert.equal(m._meta.hostOverride.log_opt_in, false);
  assert.equal(sha(BASE), before);
});
test('OVR: allowlist rejects binary/library/model/args/unknown keys', () => {
  for (const k of ['command', 'llama_server_bin', 'LD_LIBRARY_PATH', 'model', 'args', 'extra_args', 'host', 'cors_origins']) {
    refused(() => validateHostOverride({ [k]: 'x' }, { HOME: '/h' }), /not allowed|names a binary/);
  }
});
test('OVR: ${} expansion refused; api_key_file outside $HOME refused', () => {
  refused(() => validateHostOverride({ api_key_file: '${HOME}/k' }, { HOME: '/h' }), /expansion not allowed/);
  refused(() => validateHostOverride({ api_key_file: '/etc/k' }, { HOME: '/h' }), /outside \$HOME/);
  refused(() => validateHostOverride({ api_key_file: '/h/../etc/k' }, { HOME: '/h' }), /outside \$HOME/);
  assert.equal(validateHostOverride({ api_key_file: '/h/.green-roomz-state/key' }, { HOME: '/h' }).api_key_file, '/h/.green-roomz-state/key');
});
test('OVR: port type/range enforced', () => {
  refused(() => validateHostOverride({ port: '8080' }, {}), /port must be/);
  refused(() => validateHostOverride({ port: 80 }, {}), /port must be/);
});
test('OVR: symlink, non-regular file, mode != 600, state dir != 700 are refused', () => {
  let { h, f } = home(undefined);
  const real = join(h, 'real.json'); writeFileSync(real, '{}'); chmodSync(real, 0o600); symlinkSync(real, f);
  refused(() => readHostOverride(f, { HOME: h }), /symlink/);
  ({ h, f } = home(undefined)); mkdirSync(f);
  refused(() => readHostOverride(f, { HOME: h }), /not a regular file/);
  ({ h, f } = home({ port: 8099 }, { mode: 0o644 }));
  refused(() => readHostOverride(f, { HOME: h }), /must be 600/);
  ({ h, f } = home({ port: 8099 }, { dirMode: 0o755 }));
  refused(() => readHostOverride(f, { HOME: h }), /must be 700/);
});
test('OVR: loadManifest refuses a bad override rather than ignoring it', async () => {
  const { h } = home({ model: '/etc/passwd' });
  await assert.rejects(loadManifest(BASE, { ...process.env, HOME: h }), (e) => /names a binary/.test(JSON.stringify(e.details)));
});
test('OVR: absent override and absent state dir are fine', async () => {
  const h = mkdtempSync(join(tmpdir(), 'grz-ovr-none-'));
  const m = await loadManifest(BASE, { ...process.env, HOME: h });
  assert.equal(m._meta.hostOverride, null);
});
