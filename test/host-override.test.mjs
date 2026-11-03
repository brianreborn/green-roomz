import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, readHostOverride, validateHostOverride, hostOverridePath, isSharedStorage, sharedStoragePrefixes, apiKeyFileIssues } from '../src/config.mjs';
import { execFileSync } from 'node:child_process';
import { Gateway } from '../src/gateway.mjs';

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
  const { h } = home(undefined);
  refused(() => validateHostOverride({ api_key_file: '${HOME}/k' }, { HOME: h }), /expansion not allowed/);
  const out = mkdtempSync(join(tmpdir(), 'grz-out-')); const ok = join(out, 'k'); writeFileSync(ok, 'x'); chmodSync(ok, 0o600);
  refused(() => validateHostOverride({ api_key_file: ok }, { HOME: h }), /outside \$HOME/);
  refused(() => validateHostOverride({ api_key_file: join(h, '..', out.split('/').pop(), 'k') }, { HOME: h }), /outside \$HOME/);
});
test('SD-21: api_key_file realpath/lstat/mode/uid checks', () => {
  const { h, st } = home(undefined);
  const key = join(st, 'key'); writeFileSync(key, 'sekrit\n'); chmodSync(key, 0o600);
  assert.equal(validateHostOverride({ api_key_file: key }, { HOME: h }).api_key_file, key);
  chmodSync(key, 0o400); assert.deepEqual(apiKeyFileIssues(key, { HOME: h }), []);
  chmodSync(key, 0o640); refused(() => validateHostOverride({ api_key_file: key }, { HOME: h }), /must be 600 or 400/);
  chmodSync(key, 0o600);
  const link = join(st, 'keylink'); symlinkSync(key, link);
  refused(() => validateHostOverride({ api_key_file: link }, { HOME: h }), /symlink/);
  const d = join(st, 'kdir'); mkdirSync(d); chmodSync(d, 0o600);
  refused(() => validateHostOverride({ api_key_file: d }, { HOME: h }), /not a regular file/);
  refused(() => validateHostOverride({ api_key_file: join(st, 'missing') }, { HOME: h }), /does not exist/);
  // intermediate dir symlinked out of HOME: realpath catches it
  const out = mkdtempSync(join(tmpdir(), 'grz-out-')); writeFileSync(join(out, 'k'), 'x'); chmodSync(join(out, 'k'), 0o600);
  symlinkSync(out, join(h, 'esc'));
  refused(() => validateHostOverride({ api_key_file: join(h, 'esc', 'k') }, { HOME: h }), /outside \$HOME/);
  // $HOME itself is realpath'd: a HOME reached via symlink still accepts its own files
  const hl = join(tmpdir(), `grz-hl-${process.pid}`); symlinkSync(h, hl);
  assert.deepEqual(apiKeyFileIssues(join(hl, '.green-roomz-state', 'key'), { HOME: hl }), []);
});
test('SD-21: shared-storage prefix list is one file, same answers in JS and shell', () => {
  const want = ['/storage/', '/sdcard', '/mnt/sdcard', '/mnt/user/', '/mnt/media_rw/', '/data/media/', '/data/local/tmp'];
  assert.deepEqual([...sharedStoragePrefixes()], want);
  const cases = ['/storage/emulated/0/k', '/sdcard', '/sdcard/k', '/mnt/sdcard/k', '/mnt/user/0/k', '/mnt/media_rw/X/k', '/data/media/0/k', '/data/local/tmp', '/data/local/tmp/grz/k',
    '/data/data/com.termux/files/home/k', '/sdcardx/k', '/storagex', '/data/local/tmpx/k'];
  for (const c of cases) {
    const js = isSharedStorage(c);
    const sh = execFileSync('bash', ['-c', `source "${join(ROOT, 'scripts', 'note9-shared-storage.sh')}"; grz_is_shared_storage "$1" && echo y || echo n`, 'x', c]).toString().trim() === 'y';
    assert.equal(js, sh, c);
    assert.equal(js, !/home|x\//.test(c) && !c.endsWith('x'), c);
  }
});
test('SD-23: override >4KB refused, duplicate keys refused, accepted keys logged, api_key_file used', async () => {
  let { h, f } = home(undefined);
  writeFileSync(f, JSON.stringify({ port: 8099, log_opt_in: false }) + ' '.repeat(4100)); chmodSync(f, 0o600);
  refused(() => readHostOverride(f, { HOME: h }), /cap 4096/);
  ({ h, f } = home(undefined));
  writeFileSync(f, '{"port": 8099, "port": 9001}'); chmodSync(f, 0o600);
  refused(() => readHostOverride(f, { HOME: h }), /duplicate keys: port/);
  ({ h, f } = home(undefined));
  writeFileSync(f, '{"port": {"x": 1}}'); chmodSync(f, 0o600);
  refused(() => readHostOverride(f, { HOME: h }), /scalar|port must be/);
  const st = join(h, '.green-roomz-state'); const key = join(st, 'key'); writeFileSync(key, 'tok-123\n'); chmodSync(key, 0o600);
  writeFileSync(f, JSON.stringify({ port: 8099, api_key_file: key })); chmodSync(f, 0o600);
  const logs = []; const w = process.stderr.write; process.stderr.write = (c, ...r) => { logs.push(String(c)); return true; };
  let m; try { m = await loadManifest(BASE, { ...process.env, HOME: h }); } finally { process.stderr.write = w; }
  assert.ok(logs.some((l) => /accepted keys: api_key_file, port/.test(l)), logs.join(''));
  const saved = process.env.GREEN_ROOMZ_API_KEY; delete process.env.GREEN_ROOMZ_API_KEY;
  try {
    const g = new Gateway({ manifest: m, registry: {}, processes: {}, sessions: {}, policy: {}, hostAdapter: {} });
    assert.equal(g.apiKey, 'tok-123');
  } finally { if (saved !== undefined) process.env.GREEN_ROOMZ_API_KEY = saved; }
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
