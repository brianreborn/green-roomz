import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'note9-verify-runtime.sh');
const PIDLIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'note9-serve-pid.sh');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const MAN = 'config/note9-runtime.SHA256SUMS';
const hasBash = spawnSync('bash', ['-c', 'command -v sha256sum && command -v realpath'], { encoding: 'utf8' }).status === 0;

function fixture({ files = { 'bin/llama-server': 'ELF', 'bin/libggml.so': 'SO', 'lib/libggml.so': 'SO', 'models/m.gguf': 'GGUF' }, tree = { 'src/gateway.mjs': 'js' }, manifest } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'grz-n9-')); mkdirSync(join(root, 'home'));
  const stage = join(root, 'stage'); const tsrc = join(stage, 'green-roomz');
  const put = (base, rel, data) => { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), data); };
  for (const [r, d] of Object.entries(files)) put(stage, r, d);
  for (const [r, d] of Object.entries(tree)) put(tsrc, r, d);
  const lines = manifest ?? [
    ...Object.entries(files).map(([r, d]) => `${sha(d)}  ${r}`),
    ...Object.entries(tree).map(([r, d]) => `${sha(d)}  tree/${r}`),
  ];
  const text = `# test manifest\n${lines.join('\n')}\n`;
  if (manifest !== null) put(tsrc, MAN, text);
  return { root, stage, tsrc, rt: join(root, 'home', 'grz-runtime'), dst: join(root, 'home', 'green-roomz'), manSha: sha(text), put };
}
function run(f, env = {}) {
  const r = spawnSync('bash', [SCRIPT, f.stage, f.tsrc, f.rt, f.dst], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: join(f.root, 'home'), GRZ_MANIFEST_SHA256: f.manSha, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('NOTE9-RT: valid manifest + anchor copies and verifies', { skip: !hasBash }, () => {
  const f = fixture(); const r = run(f);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(f.rt, 'bin/llama-server'), 'utf8'), 'ELF');
  assert.equal(readFileSync(join(f.dst, 'src/gateway.mjs'), 'utf8'), 'js');
  assert.equal(statSync(join(f.rt, 'bin/llama-server')).mode & 0o777, 0o755);
  assert.equal(readFileSync(join(f.rt, '.verified'), 'utf8').trim(), f.manSha);
});
test('NOTE9-RT: hash mismatch aborts', { skip: !hasBash }, () => {
  const f = fixture(); f.put(f.stage, 'lib/libggml.so', 'TAMPERED');
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /mismatch/);
});
test('NOTE9-RT: tampered JS tree file aborts', { skip: !hasBash }, () => {
  const f = fixture(); f.put(f.tsrc, 'src/gateway.mjs', 'evil');
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /mismatch/);
});
test('NOTE9-RT: missing manifest aborts', { skip: !hasBash }, () => {
  const f = fixture({ manifest: null }); const r = run(f);
  assert.notEqual(r.code, 0); assert.match(r.out, /missing; refusing/);
  assert.equal(existsSync(join(f.rt, 'bin/llama-server')), false);
});
test('NOTE9-RT: empty (placeholder) manifest aborts', { skip: !hasBash }, () => {
  const f = fixture({ manifest: [] }); const r = run(f);
  assert.notEqual(r.code, 0); assert.match(r.out, /no entries/);
});
test('NOTE9-RT: unlisted staged runtime file aborts and is not copied', { skip: !hasBash }, () => {
  const f = fixture(); f.put(f.stage, 'lib/libevil.so', 'x');
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /lib\/libevil\.so is not listed/);
  assert.equal(existsSync(join(f.rt, 'lib/libevil.so')), false);
});
test('NOTE9-RT: unlisted JS tree file aborts', { skip: !hasBash }, () => {
  const f = fixture(); f.put(f.tsrc, 'src/extra.mjs', 'x');
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /tree\/src\/extra\.mjs is not listed/);
});
test('NOTE9-RT: GRZ_MANIFEST_SHA256 unset or wrong aborts and prints actual hash', { skip: !hasBash }, () => {
  const f = fixture();
  let r = run(f, { GRZ_MANIFEST_SHA256: '' });
  assert.notEqual(r.code, 0); assert.match(r.out, new RegExp(`unset \\(manifest sha256=${f.manSha}\\)`));
  r = run(f, { GRZ_MANIFEST_SHA256: '0'.repeat(64) });
  assert.notEqual(r.code, 0); assert.match(r.out, /does not match/); assert.ok(r.out.includes(f.manSha));
});
test('NOTE9-RT: GRZ_RUNTIME_SUMS outside the cut tree is refused', { skip: !hasBash }, () => {
  const f = fixture(); f.put(f.root, 'outside.sums', '# x\n');
  const r = run(f, { GRZ_RUNTIME_SUMS: join(f.root, 'outside.sums') });
  assert.notEqual(r.code, 0); assert.match(r.out, /outside the cut tree/);
});
test('NOTE9-RT: GRZ_RUNTIME_SUMS symlink in tree pointing outside is refused (realpath)', { skip: !hasBash }, () => {
  const f = fixture(); f.put(f.root, 'outside.sums', '# x\n'); mkdirSync(join(f.dst, 'config'), { recursive: true });
  symlinkSync(join(f.root, 'outside.sums'), join(f.dst, 'config', 'link.sums'));
  const r = run(f, { GRZ_RUNTIME_SUMS: join(f.dst, 'config', 'link.sums') });
  assert.notEqual(r.code, 0); assert.match(r.out, /outside the cut tree/);
});
test('NOTE9-RT: GRZ_ALLOW_UNVERIFIED_RUNTIME=1 proceeds with loud warning', { skip: !hasBash }, () => {
  const f = fixture({ manifest: null });
  const r = run(f, { GRZ_ALLOW_UNVERIFIED_RUNTIME: '1' });
  assert.equal(r.code, 0, r.out); assert.match(r.out, /WARNING: GRZ_ALLOW_UNVERIFIED_RUNTIME=1/);
});
test('NOTE9-PID: pidfile kill only when /proc cmdline matches; pidfile mode 600', { skip: !hasBash || !existsSync('/proc/self/cmdline') }, () => {
  const root = mkdtempSync(join(tmpdir(), 'grz-pid-'));
  const pf = join(root, 'grz-serve.pid');
  const script = `. "${PIDLIB}"; sleep 30 & other=$!; grz_write_pid $other; stat -c %a "$GRZ_SERVE_PIDFILE"; grz_stop_serve; kill -0 $other && echo ALIVE; kill $other`;
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, GRZ_SERVE_PIDFILE: pf } });
  assert.match(r.stdout, /^600$/m); assert.match(r.stdout, /ALIVE/); assert.match(r.stderr, /not green-roomz serve; not killing/);
});

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'note9-run-llama-server.termux.sh');
function runRunner(f, env = {}) {
  const r = spawnSync('bash', [RUNNER, '--version'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: join(f.root, 'home'), TERMUX_VERSION: '0.118', LD_LIBRARY_PATH: '/evil', ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}
function installed() {
  // llama-server stub prints its LD_LIBRARY_PATH so the runner's env is observable.
  const f = fixture({ files: { 'bin/llama-server': '#!/bin/sh\necho "LDP=$LD_LIBRARY_PATH"\n', 'bin/libggml.so': 'SO', 'models/m.gguf': 'GGUF' } });
  const r = run(f); assert.equal(r.code, 0, r.out); return f;
}
const listTree = (d) => spawnSync('bash', ['-c', `cd "${d}" && find . -type f -exec sha256sum {} + | sort`], { encoding: 'utf8' }).stdout;

test('NOTE9-RT: mismatch leaves the live tree byte-identical; temp dir removed', { skip: !hasBash }, () => {
  const f = installed(); const before = listTree(f.rt) + listTree(f.dst);
  f.put(f.stage, 'bin/libggml.so', 'TAMPERED');
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /mismatch/);
  assert.equal(listTree(f.rt) + listTree(f.dst), before);
  assert.deepEqual(spawnSync('bash', ['-c', `ls -A "${join(f.root, 'home')}" | grep grz-verify || true`], { encoding: 'utf8' }).stdout, '');
});
test('NOTE9-RT: stale unlisted file in live runtime is removed by the swap', { skip: !hasBash }, () => {
  const f = installed(); f.put(f.rt, 'bin/libstale.so', 'old'); f.put(f.dst, 'src/stale.mjs', 'old');
  const r = run(f); assert.equal(r.code, 0, r.out);
  assert.equal(existsSync(join(f.rt, 'bin/libstale.so')), false);
  assert.equal(existsSync(join(f.dst, 'src/stale.mjs')), false);
});
test('NOTE9-RT: staged symlink is refused loudly', { skip: !hasBash }, () => {
  const f = fixture(); symlinkSync('/etc/passwd', join(f.stage, 'bin', 'evil.so'));
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /staged symlink .*evil\.so; refusing/);
  assert.equal(existsSync(join(f.rt)), false);
});
test('NOTE9-RT: exec bits set after the cmp-skip path (second identical run)', { skip: !hasBash }, () => {
  const f = installed(); spawnSync('chmod', ['600', join(f.rt, 'bin/llama-server')]);
  const r = run(f); assert.equal(r.code, 0, r.out);
  assert.equal(statSync(join(f.rt, 'bin/llama-server')).mode & 0o777, 0o755);
});
test('NOTE9-RUN: runner refuses without .verified, or when it does not match', { skip: !hasBash }, () => {
  const f = installed();
  let r = runRunner(f); assert.equal(r.code, 0, r.out);
  r = runRunner(f, { GRZ_MANIFEST_SHA256: '0'.repeat(64) }); assert.notEqual(r.code, 0); assert.match(r.out, /GRZ_MANIFEST_SHA256; refusing/);
  writeFileSync(join(f.rt, '.verified'), 'f'.repeat(64)); r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /does not match manifest/);
  spawnSync('rm', [join(f.rt, '.verified')]); r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /\.verified missing/);
});
test('NOTE9-RUN: LD_LIBRARY_PATH is exactly $RT/bin (caller value dropped)', { skip: !hasBash }, () => {
  const f = installed(); const r = runRunner(f);
  assert.equal(r.code, 0, r.out); assert.match(r.out, new RegExp(`^LDP=${f.rt}/bin$`, 'm'));
});
test('NOTE9-RUN: refuses if a bin/*.so or model in $RT is not in the manifest', { skip: !hasBash }, () => {
  let f = installed(); f.put(f.rt, 'bin/libextra.so', 'x');
  let r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /bin\/libextra\.so is not listed/);
  f = installed(); f.put(f.rt, 'models/other.gguf', 'x');
  r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /models\/other\.gguf is not listed/);
});
test('NOTE9-RUN: adb /data/local/tmp branch needs GRZ_ADB_DEBUG=1', { skip: !hasBash }, () => {
  const r = spawnSync('bash', [RUNNER], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: tmpdir() } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /UNVERIFIED.*GRZ_ADB_DEBUG=1/);
});
