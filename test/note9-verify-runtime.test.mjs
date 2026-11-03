import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, statSync, lstatSync, readlinkSync, readdirSync, chmodSync, renameSync, utimesSync } from 'node:fs';
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
  return { root, stage, tsrc, rt: join(root, 'home', 'grz.current', 'runtime'), dst: join(root, 'home', 'grz.current', 'tree'), cur: join(root, 'home', 'grz.current'), home: join(root, 'home'), manSha: sha(text), put };
}
function run(f, env = {}) {
  const r = spawnSync('bash', [SCRIPT, f.stage, f.tsrc], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: join(f.root, 'home'), GRZ_MANIFEST_SHA256: f.manSha, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('NOTE9-RT: valid manifest + anchor copies and verifies', { skip: !hasBash }, () => {
  const f = fixture(); const r = run(f);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(f.rt, 'bin/llama-server'), 'utf8'), 'ELF');
  assert.equal(readFileSync(join(f.dst, 'src/gateway.mjs'), 'utf8'), 'js');
  assert.equal(statSync(join(f.rt, 'bin/llama-server')).mode & 0o777, 0o755);
  assert.equal(readFileSync(join(f.cur, '.verified'), 'utf8').trim(), f.manSha);
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
test('NOTE9-RT: GRZ_RUNTIME_SUMS is ignored (manifest only from the staged tree)', { skip: !hasBash }, () => {
  const f = fixture(); f.put(f.root, 'outside.sums', '# x\n');
  const r = run(f, { GRZ_RUNTIME_SUMS: join(f.root, 'outside.sums') });
  assert.equal(r.code, 0, r.out); assert.match(r.out, new RegExp(`sha256=${f.manSha}`));
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
  const r = spawnSync('bash', [RUNNER, '--version'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: join(f.root, 'home'), TERMUX_VERSION: '0.118', LD_LIBRARY_PATH: '/evil', GRZ_MANIFEST_SHA256: f.manSha, ...env } });
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
  writeFileSync(join(f.cur, '.verified'), 'f'.repeat(64)); r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /does not match manifest/);
  spawnSync('rm', [join(f.cur, '.verified')]); r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /\.verified missing/);
});
test('NOTE9-RUN: LD_LIBRARY_PATH is exactly $RT/bin (caller value dropped)', { skip: !hasBash }, () => {
  const f = installed(); const r = runRunner(f);
  assert.equal(r.code, 0, r.out); assert.match(r.out, new RegExp(`^LDP=${f.home}/grz.${f.manSha}/runtime/bin$`, 'm'));
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

// --- SD layout: $HOME/grz.<sha>/ + grz.current, sweep, anchor, SDK gate -------------------
test('NOTE9-LAYOUT: one folder grz.<sha> with runtime+tree; grz.current is the only symlink', { skip: !hasBash }, () => {
  const f = installed();
  assert.ok(lstatSync(f.cur).isSymbolicLink());
  assert.equal(readlinkSync(f.cur), `grz.${f.manSha}`);
  assert.equal(readFileSync(join(f.home, `grz.${f.manSha}`, '.verified'), 'utf8').trim(), f.manSha);
  assert.equal(statSync(join(f.home, `grz.${f.manSha}`)).mode & 0o777, 0o700);
});
test('NOTE9-SWEEP: startup removes .grz-verify.* and *.old.*; keeps current + one previous grz.*', { skip: !hasBash }, () => {
  const f = installed();
  mkdirSync(join(f.home, '.grz-verify.ABC123')); mkdirSync(join(f.home, `grz.${f.manSha}.old.42`));
  const old1 = join(f.home, 'grz.' + '1'.repeat(64)); const old2 = join(f.home, 'grz.' + '2'.repeat(64));
  mkdirSync(old1); mkdirSync(old2);
  utimesSync(old1, new Date(1000e3), new Date(1000e3)); utimesSync(old2, new Date(2000e3), new Date(2000e3));
  // force a new current: change the tree so the manifest sha changes
  const g = fixture({ tree: { 'src/gateway.mjs': 'js2' } }); g.root = f.root;
  const r = spawnSync('bash', [SCRIPT, g.stage, g.tsrc], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: g.manSha } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const left = readdirSync(f.home).sort();
  assert.ok(!left.some((n) => n.startsWith('.grz-verify.') || n.includes('.old.')), left.join(','));
  assert.ok(left.includes(`grz.${g.manSha}`) && left.includes('grz.current'));
  assert.ok(left.includes(`grz.${f.manSha}`), 'previous kept'); // newest non-current
  assert.ok(!left.includes(old1.split('/').pop()) && !left.includes(old2.split('/').pop()), left.join(','));
});
test('NOTE9-LAYOUT: a non-symlink grz.current is refused', { skip: !hasBash }, () => {
  const f = fixture(); mkdirSync(f.cur, { recursive: true });
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /not a symlink; refusing/);
});
test('NOTE9-RUN: anchor always required; escape hatch only with GRZ_ALLOW_UNVERIFIED_RUNTIME=1', { skip: !hasBash }, () => {
  const f = installed();
  let r = runRunner(f, { GRZ_MANIFEST_SHA256: '' }); assert.notEqual(r.code, 0); assert.match(r.out, /GRZ_MANIFEST_SHA256 unset; refusing/);
  r = runRunner(f, { GRZ_MANIFEST_SHA256: '', GRZ_ALLOW_UNVERIFIED_RUNTIME: '1' }); assert.equal(r.code, 0, r.out); assert.match(r.out, /anchor check skipped/);
});
test('NOTE9-RUN: GRZ_RUNTIME_DIR / GRZ_TREE_DIR overrides are ignored', { skip: !hasBash }, () => {
  const f = installed(); const r = runRunner(f, { GRZ_RUNTIME_DIR: '/nonexistent', GRZ_TREE_DIR: '/nonexistent' });
  assert.equal(r.code, 0, r.out);
});
test('NOTE9-RUN: refuses any symlink inside the versioned folder, and a current not named grz.<sha>', { skip: !hasBash }, () => {
  let f = installed(); symlinkSync('/etc/passwd', join(f.dst, 'evil'));
  let r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /symlink .*evil.*refusing/);
  f = installed(); const d = join(f.home, `grz.${f.manSha}`); renameSync(d, join(f.home, 'grz.other'));
  spawnSync('ln', ['-sfn', 'grz.other', f.cur]);
  r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /not .*grz\.<sha256>; refusing/);
});
function stubGetprop(root, sdk) {
  const bin = join(root, 'stubbin'); mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'getprop'), `#!/bin/sh\n[ "$1" = ro.build.version.sdk ] && echo ${sdk}\n`); chmodSync(join(bin, 'getprop'), 0o755);
  return `${bin}:${process.env.PATH}`;
}
test('NOTE9-SDK: runner refuses Android < 9 (stubbed getprop sdk 27), allows 28', { skip: !hasBash }, () => {
  const f = installed();
  let r = runRunner(f, { PATH: stubGetprop(f.root, 27) }); assert.notEqual(r.code, 0); assert.match(r.out, /SDK 27 .*needs Android 9 \(API 28\) or later/);
  r = runRunner(f, { PATH: stubGetprop(join(f.root, 'b'), 28) }); assert.equal(r.code, 0, r.out);
});
const SETUP = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'note9-termux-setup.sh');
test('NOTE9-SDK: setup refuses Android < 9 before touching anything (stubbed getprop)', { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), 'grz-n9sdk-'));
  const r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: stubGetprop(root, 26), HOME: root } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /SDK 26 .*needs Android 9 \(API 28\) or later/);
  assert.equal(existsSync(join(root, 'grz-setup.log')), false);
});
test('NOTE9-SETUP: setup never edits verified files (no sed on the manifest; override in state dir)', () => {
  const text = readFileSync(SETUP, 'utf8');
  assert.doesNotMatch(text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'), /\bsed\s/);
  assert.match(text, /OVR="\$STATE\/agents\.note9\.local\.json"/);
});
