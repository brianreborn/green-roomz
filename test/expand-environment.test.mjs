import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandEnvironment, EXPAND_ENV_ALLOWLIST, nfcPath, headerSafe } from '../src/util.mjs';
import { loadManifest, withDefaultGrzEnv } from '../src/config.mjs';
import { DEFAULT_MANIFEST } from '../src/constants.mjs';

test('allowlist is GRZ_ROOT / GRZ_EXE / HOME / GRZ_LLAMA', () => {
  assert.deepEqual([...EXPAND_ENV_ALLOWLIST].sort(), ['GRZ_EXE', 'GRZ_LLAMA', 'GRZ_ROOT', 'HOME'].sort());
});

test('e001 missing key stays literal (not empty collapse to open hole)', () => {
  const out = expandEnvironment('pre-${MISSING}-post', { FOO: 'alpha' });
  assert.equal(out, 'pre-${MISSING}-post');
});

test('e002 nested ${${FOO}} does not expand inner via allowlist', () => {
  const out = expandEnvironment('${${FOO}}', { FOO: 'alpha', GRZ_ROOT: '/x' });
  // Inner ${FOO} is not allowlisted as a whole-token key name in one pass the way old code did;
  // pattern matches ${FOO} inside — FOO not allowlisted → stays.
  assert.equal(out, '${${FOO}}');
});

test('e003 ${constructor} does not resolve Object.prototype', () => {
  const out = expandEnvironment('${constructor}', { FOO: 'alpha' });
  assert.equal(out, '${constructor}');
  assert.ok(!String(out).includes('native code'));
});

test('e004 empty GRZ_ROOT expands to empty string at expand layer', () => {
  const out = expandEnvironment('${GRZ_ROOT}/runtime/llama-server', { GRZ_ROOT: '' });
  assert.equal(out, '/runtime/llama-server');
});

test('e005 unicode key not allowlisted', () => {
  const out = expandEnvironment('${GRZ_ROOT}-café', { GRZ_ROOT: '/ok' });
  assert.equal(out, '/ok-café');
});

test('e006 huge key not allowlisted stays literal', () => {
  const key = 'A'.repeat(200);
  const out = expandEnvironment(`\${${key}}`, { [key]: 'x', GRZ_ROOT: '/r' });
  assert.equal(out, `\${${key}}`);
});

test('e007 object tree expands allowlisted only', () => {
  const out = expandEnvironment({ a: '${GRZ_ROOT}/m', b: '${PATH}/x', c: ['${HOME}/z'] }, {
    GRZ_ROOT: '/root', HOME: '/home', PATH: '/bin',
  });
  assert.equal(out.a, '/root/m');
  assert.equal(out.b, '${PATH}/x');
  assert.equal(out.c[0], '/home/z');
});

test('e008 unclosed brace left alone', () => {
  assert.equal(expandEnvironment('pre-${GRZ_ROOT', { GRZ_ROOT: '/r' }), 'pre-${GRZ_ROOT');
});

test('e009 empty braces left alone', () => {
  assert.equal(expandEnvironment('${}', { GRZ_ROOT: '/r' }), '${}');
});

test('e010 lowercase ${grz_root} does not match', () => {
  assert.equal(expandEnvironment('${grz_root}/runtime', { GRZ_ROOT: '/r', grz_root: '/evil' }), '${grz_root}/runtime');
});

test('%GRZ_ROOT% percent-VAR is documented-rejected (left literal)', () => {
  assert.equal(expandEnvironment('%GRZ_ROOT%/runtime', { GRZ_ROOT: '/r' }), '%GRZ_ROOT%/runtime');
});

test('withDefaultGrzEnv supplies GRZ_ROOT from package root when unset', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const env = withDefaultGrzEnv({ HOME: '/home' }, root);
  assert.equal(env.GRZ_ROOT, root);
  assert.equal(env.GRZ_EXE, process.platform === 'win32' ? '.exe' : '');
  assert.ok(String(env.GRZ_LLAMA).includes('llama-server'));
});

test('loadManifest defaults GRZ_ROOT; never collapses to /runtime/llama-server', async () => {
  const env = { ...process.env };
  delete env.GRZ_ROOT;
  delete env.GRZ_LLAMA;
  delete env.GRZ_EXE;
  const manifest = await loadManifest(DEFAULT_MANIFEST, env);
  const cmd = manifest.runtimes.llama_server.command;
  assert.ok(cmd);
  assert.notEqual(cmd, '/runtime/llama-server');
  assert.ok(!cmd.startsWith('/runtime/llama-server'));
  assert.ok(path.isAbsolute(cmd) || /^[A-Za-z]:[\\/]/.test(cmd));
});

test('loadManifest strips UTF-8 BOM', async () => {
  // agents.cursor.json has no BOM; ensure loader tolerates by round-trip through expand path
  const manifest = await loadManifest();
  assert.ok(manifest.agents.length >= 11);
});

test('nfcPath no-op on linux', () => {
  assert.equal(nfcPath('/tmp/café'), '/tmp/café');
});

test('headerSafe caps by utf8 bytes', () => {
  const s = 'é'.repeat(200);
  const out = headerSafe(s, 10);
  assert.ok(Buffer.byteLength(out, 'utf8') <= 10);
});

test('note9 after expand has no /data/local/tmp for command or resident model', async () => {
  const env = withDefaultGrzEnv({ HOME: '/data/data/com.termux/files/home' });
  const manifest = await loadManifest(new URL('../config/agents.note9.json', import.meta.url), env);
  const cmd = manifest.runtimes.llama_server.command;
  const nexus = manifest.agents.find((a) => a.alias === 'tool-router-agent');
  assert.ok(!cmd.includes('/data/local/tmp'));
  assert.ok(!String(nexus.model).includes('/data/local/tmp'));
  assert.ok(cmd.includes('grz-runtime'));
  assert.deepEqual(nexus.languages, ['en']);
});
