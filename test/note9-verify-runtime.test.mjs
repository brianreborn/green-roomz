import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, statSync, lstatSync, readlinkSync, readdirSync, chmodSync, renameSync, utimesSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'note9-verify-runtime.sh');
const PIDLIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'note9-serve-pid.sh');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const MAN = 'config/note9-runtime.SHA256SUMS';
const hasBash = spawnSync('bash', ['-c', 'command -v sha256sum && command -v realpath'], { encoding: 'utf8' }).status === 0;

const SS_HELPER = readFileSync(new URL('../scripts/note9-shared-storage.sh', import.meta.url), 'utf8');
const SS_LIST = readFileSync(new URL('../config/shared-storage-prefixes.txt', import.meta.url), 'utf8');
function fixture({ files = { 'bin/llama-server': 'ELF', 'bin/libggml.so': 'SO', 'lib/libggml.so': 'SO', 'models/m.gguf': 'GGUF' }, tree = { 'src/gateway.mjs': 'js' }, manifest } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'grz-n9-')); mkdirSync(join(root, 'home'));
  const stage = join(root, 'stage'); const tsrc = join(stage, 'green-roomz');
  const put = (base, rel, data) => { mkdirSync(dirname(join(base, rel)), { recursive: true }); writeFileSync(join(base, rel), data); };
  // The runner sources the shared-storage helper from the hashed tree (SD-21): always ship it.
  tree = { 'scripts/note9-shared-storage.sh': SS_HELPER, 'config/shared-storage-prefixes.txt': SS_LIST, ...tree };
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
  const r = spawnSync('bash', [RUNNER, '--version'], { encoding: 'utf8', env: { PATH: stubGetprop(join(f.root, 'gp28'), 28), HOME: join(f.root, 'home'), TERMUX_VERSION: '0.118', LD_LIBRARY_PATH: '/evil', GRZ_MANIFEST_SHA256: f.manSha, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}
function installed() {
  // llama-server stub prints its LD_LIBRARY_PATH so the runner's env is observable.
  const f = fixture({ files: { 'bin/llama-server': '#!/bin/sh\necho "LDP=$LD_LIBRARY_PATH"\n', 'bin/libggml.so': 'SO', 'models/m.gguf': 'GGUF' } });
  const r = run(f); assert.equal(r.code, 0, r.out); return f;
}
const listTree = (d) => spawnSync('bash', ['-c', `cd "${d}" && find . -type f -exec sha256sum {} + | sort`], { encoding: 'utf8' }).stdout;

test('NOTE9-RT: mismatch leaves the live tree byte-identical; temp dir removed', { skip: !hasBash }, () => {
  const f = installed(); const live = join(f.home, `grz.${f.manSha}`);
  const before = listTree(join(live, 'runtime')) + listTree(join(live, 'tree'));
  unlinkSync(f.cur); // force a real install (same sha + intact would be skipped, SD-25)
  f.put(f.stage, 'bin/libggml.so', 'TAMPERED');
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /mismatch/);
  assert.equal(listTree(join(live, 'runtime')) + listTree(join(live, 'tree')), before);
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

// --- N5 SDK strictness, .node addons, refresh/restart via grz.current, log_opt_in -------------
const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const REPO = join(SCRIPTS, '..');
test('N5: runner refuses empty or non-numeric getprop output', { skip: !hasBash }, () => {
  const f = installed();
  for (const v of ["''", 'abc', '28x']) {
    const r = runRunner(f, { PATH: stubGetprop(join(f.root, `gp-${v.length}${v[0]}`), v) });
    assert.notEqual(r.code, 0, v); assert.match(r.out, /empty\/non-numeric.*refusing/, v);
  }
});
function stubUname(dir) { mkdirSync(dir, { recursive: true }); const u = join(dir, 'uname'); writeFileSync(u, '#!/bin/sh\n[ "$1" = -o ] && { echo Android; exit 0; }\necho Linux\n'); chmodSync(u, 0o755); return dir; }
test('N5: Android = TERMUX_VERSION or uname -o Android (PREFIX ignored); missing getprop refused there, skipped elsewhere', { skip: !hasBash }, () => {
  const f = installed();
  const base = process.env.PATH.split(':').filter((d) => !existsSync(join(d, 'getprop'))).join(':');
  let r = runRunner(f, { PATH: base }); // TERMUX_VERSION set by runRunner
  assert.notEqual(r.code, 0); assert.match(r.out, /getprop not found but this is Android/);
  r = runRunner(f, { PATH: `${stubUname(join(f.root, 'un'))}:${base}`, TERMUX_VERSION: '' });
  assert.notEqual(r.code, 0); assert.match(r.out, /getprop not found but this is Android/);
  // PREFIX alone is NOT an Android signal: SDK check skipped, non-Android adb gate reached.
  const r1 = spawnSync('bash', [RUNNER], { encoding: 'utf8', env: { PATH: base, HOME: f.home, PREFIX: '/data/data/com.termux/files/usr' } });
  assert.doesNotMatch(r1.stderr, /getprop/); assert.match(r1.stderr, /GRZ_ADB_DEBUG=1/);
  const r2 = spawnSync('bash', [RUNNER], { encoding: 'utf8', env: { PATH: base, HOME: f.home } });
  assert.doesNotMatch(r2.stderr, /getprop/); assert.match(r2.stderr, /GRZ_ADB_DEBUG=1/);
});
test('N5: setup refuses empty / non-numeric getprop and missing getprop under Termux; proceeds past the gate off-Android', { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), 'grz-n5s-'));
  const base = process.env.PATH.split(':').filter((d) => !existsSync(join(d, 'getprop'))).join(':');
  let r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: stubGetprop(join(root, 'a'), "''"), HOME: root } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /empty\/non-numeric/);
  r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: stubGetprop(join(root, 'b'), 'Q'), HOME: root } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /empty\/non-numeric/);
  r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: base, HOME: root, TERMUX_VERSION: '0.118' } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /getprop not found but this is Android/);
  r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: `${stubUname(join(root, 'un'))}:${base}`, HOME: root } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /getprop not found but this is Android/);
  r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: base, HOME: root, PREFIX: '/data/data/com.termux/files/usr' } });
  assert.doesNotMatch(r.stdout + r.stderr, /getprop|API 28/); // PREFIX alone is not Android
  r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: base, HOME: root } });
  assert.doesNotMatch(r.stdout + r.stderr, /getprop|API 28/); assert.match(r.stdout + r.stderr, /no green-roomz tree/);
  assert.equal(existsSync(join(root, '.green-roomz-state', 'logs')), false, 'logs off by default');
  assert.equal(existsSync(join(root, 'grz-setup.log')), false);
});
test('NODE: node_modules + listed .node install inside the hashed tree; unlisted .node refused by verifier', { skip: !hasBash }, () => {
  let f = fixture({ tree: { 'src/gateway.mjs': 'js', 'node_modules/addon/build/addon.node': 'ELF-NODE', 'node_modules/addon/index.js': 'x' } });
  let r = run(f); assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(f.home, `grz.${f.manSha}`, 'tree/node_modules/addon/build/addon.node'), 'utf8'), 'ELF-NODE');
  assert.equal(existsSync(join(f.home, '.green-roomz-state', 'node_modules')), false);
  f = fixture({ tree: { 'src/gateway.mjs': 'js' } }); f.put(f.tsrc, 'node_modules/evil/evil.node', 'X');
  r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /tree\/node_modules\/evil\/evil\.node is not listed/);
});
test('NODE: runner refuses an unlisted .node dropped into the installed tree', { skip: !hasBash }, () => {
  const f = installed(); chmodSync(join(f.home, `grz.${f.manSha}`), 0o700);
  f.put(f.dst, 'node_modules/x/x.node', 'X');
  const r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /tree\/node_modules\/x\/x\.node \(native addon\) is not listed/);
});

// Fixture tree carrying the real scripts + src so refresh/restart run end to end (stub serve).
function realTree(extra = {}) {
  const tree = { 'bin/green-roomz.mjs': 'console.log("serve-stub", process.argv.slice(2).join(" ")); console.error("serve-stub-err");\n', ...extra };
  for (const n of ['note9-verify-runtime.sh', 'note9-common.sh', 'note9-serve-pid.sh', 'note9-restart-serve.sh', 'note9-refresh-src.sh', 'note9-run-llama-server.termux.sh', 'note9-shared-storage.sh']) tree[`scripts/${n}`] = readFileSync(join(SCRIPTS, n), 'utf8');
  tree['config/shared-storage-prefixes.txt'] = readFileSync(join(REPO, 'config', 'shared-storage-prefixes.txt'), 'utf8');
  for (const rel of spawnSync('bash', ['-c', 'cd src && find . -type f -name "*.mjs" -printf "%P\\n"'], { cwd: REPO, encoding: 'utf8' }).stdout.trim().split('\n')) tree[`src/${rel}`] = readFileSync(join(REPO, 'src', rel), 'utf8');
  return fixture({ files: { 'bin/llama-server': 'ELF', 'bin/libggml.so': 'SO' }, tree });
}
const envFor = (f, extra = {}) => ({ PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: f.manSha, GRZ_RESTART_NO_PROBE: '1', ...extra });
test('REFRESH: goes through verify + flip from the verified tree; bad anchor leaves grz.current unchanged; no cp into tree', { skip: !hasBash }, () => {
  const f = realTree(); assert.equal(run(f).code, 0);
  const g = realTree({ 'src/new.mjs': 'export {};\n' });
  let r = spawnSync('bash', [join(f.dst, 'scripts/note9-refresh-src.sh')], { encoding: 'utf8', env: envFor(f, { GRZ_STAGE_ROOT: g.stage, GRZ_MANIFEST_SHA256: '0'.repeat(64), GRZ_REFRESH_NO_RESTART: '1' }) });
  assert.notEqual(r.status, 0); assert.equal(readlinkSync(f.cur), `grz.${f.manSha}`);
  r = spawnSync('bash', [join(f.dst, 'scripts/note9-refresh-src.sh')], { encoding: 'utf8', env: envFor(f, { GRZ_STAGE_ROOT: g.stage, GRZ_MANIFEST_SHA256: g.manSha, GRZ_REFRESH_NO_RESTART: '1' }) });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(readlinkSync(f.cur), `grz.${g.manSha}`);
  assert.ok(existsSync(join(f.home, 'grz.current', 'tree', 'src', 'new.mjs')));
  r = spawnSync('bash', [join(f.dst, 'scripts/note9-refresh-src.sh')], { encoding: 'utf8', env: envFor(f, { GRZ_STAGE_ROOT: g.stage, GRZ_MANIFEST_SHA256: '' }) });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /GRZ_MANIFEST_SHA256 unset/);
  const text = readFileSync(join(SCRIPTS, 'note9-refresh-src.sh'), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(text, /\bcp\b|\btar\b|grz-runtime|HOME\/green-roomz/);
});
test('RESTART: resolves via grz.current (no stored path); refuses when grz.current is missing', { skip: !hasBash }, () => {
  const f = realTree(); assert.equal(run(f).code, 0);
  let r = spawnSync('bash', [join(f.dst, 'scripts/note9-restart-serve.sh')], { encoding: 'utf8', env: envFor(f) });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, new RegExp(`tree=${f.home}/grz\\.${f.manSha}/tree logs=off`));
  spawnSync('rm', [f.cur]);
  r = spawnSync('bash', [join(SCRIPTS, 'note9-restart-serve.sh')], { encoding: 'utf8', env: envFor(f) });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /grz\.current missing/);
  for (const n of ['note9-restart-serve.sh', 'note9-refresh-src.sh', 'note9-termux-setup.sh', 'note9-enable-external-apps.sh', 'note9-common.sh']) {
    const t = readFileSync(join(SCRIPTS, n), 'utf8');
    assert.doesNotMatch(t, /\$HOME\/grz-runtime|\$HOME\/green-roomz\b|GRZ_SDCARD_LOGS/, n);
  }
});
const sleepMs = (ms) => spawnSync('sleep', [String(ms / 1000)]);
function writeOverride(home, o) {
  const st = join(home, '.green-roomz-state'); mkdirSync(st, { recursive: true }); chmodSync(st, 0o700);
  writeFileSync(join(st, 'agents.note9.local.json'), JSON.stringify(o)); chmodSync(join(st, 'agents.note9.local.json'), 0o600);
}
test('LOGS: log_opt_in off by default (no files); on -> $STATE/logs/*.log mode 600; never /sdcard', { skip: !hasBash }, () => {
  const f = realTree(); assert.equal(run(f).code, 0);
  writeOverride(f.home, { port: 8099, log_opt_in: false });
  let r = spawnSync('bash', [join(f.dst, 'scripts/note9-restart-serve.sh')], { encoding: 'utf8', env: envFor(f) });
  assert.equal(r.status, 0, r.stderr); sleepMs(400);
  assert.equal(existsSync(join(f.home, '.green-roomz-state', 'logs')), false);
  assert.ok(!readdirSync(f.home).some((n) => n.endsWith('.log')));
  writeOverride(f.home, { port: 8099, log_opt_in: true });
  r = spawnSync('bash', [join(f.dst, 'scripts/note9-restart-serve.sh')], { encoding: 'utf8', env: envFor(f) });
  assert.equal(r.status, 0, r.stderr); sleepMs(600);
  const logs = join(f.home, '.green-roomz-state', 'logs');
  assert.equal(statSync(logs).mode & 0o777, 0o700);
  for (const n of ['serve.out.log', 'serve.err.log']) assert.equal(statSync(join(logs, n)).mode & 0o777, 0o600);
  assert.match(readFileSync(join(logs, 'serve.out.log'), 'utf8'), /serve-stub .*--port 8099/);
  for (const n of ['note9-common.sh', 'note9-termux-setup.sh', 'note9-restart-serve.sh', 'note9-refresh-src.sh']) {
    const code = readFileSync(join(SCRIPTS, n), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l) && !/^SD=/.test(l)).join('\n');
    assert.doesNotMatch(code, /\/sdcard/, n);
  }
});
test('LOGS: a refused override (mode 644) stops restart instead of defaulting', { skip: !hasBash }, () => {
  const f = realTree(); assert.equal(run(f).code, 0);
  writeOverride(f.home, { log_opt_in: true }); chmodSync(join(f.home, '.green-roomz-state', 'agents.note9.local.json'), 0o644);
  const r = spawnSync('bash', [join(f.dst, 'scripts/note9-restart-serve.sh')], { encoding: 'utf8', env: envFor(f) });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /must be 600|override refused/);
});
test('N6: setup resolves paths via $REALPATH (Termux $PREFIX/bin/realpath), not bare realpath', () => {
  const t = readFileSync(SETUP, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(t, /(^|[\s($])realpath\s/m);
  assert.match(readFileSync(join(SCRIPTS, 'note9-common.sh'), 'utf8'), /REALPATH=\$PREFIX\/bin\/realpath/);
});
test('EXT-APPS: enable-external-apps writes status only under the state folder', { skip: !hasBash }, () => {
  const h = mkdtempSync(join(tmpdir(), 'grz-ext-'));
  const r = spawnSync('bash', [join(SCRIPTS, 'note9-enable-external-apps.sh')], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: h } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(h, '.green-roomz-state', 'ext-apps.status'), 'utf8'), /enabled[\s\S]*DONE/);
  assert.doesNotMatch(readFileSync(join(SCRIPTS, 'note9-enable-external-apps.sh'), 'utf8'), /data\/local\/tmp\/grz/);
});

// --- SD-20 / SD-24 / SD-25 ------------------------------------------------------------------
const verifyAs = (f, g) => spawnSync('bash', [SCRIPT, g.stage, g.tsrc], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: g.manSha } });
test('SD-20: sweep only touches real grz.<64hex>.old.<n> / .grz-verify.XXXXXX dirs; never symlinks or bare *.old.*', { skip: !hasBash }, () => {
  const f = installed(); const target = mkdtempSync(join(tmpdir(), 'grz-tgt-')); writeFileSync(join(target, 'keep'), 'k');
  mkdirSync(join(f.home, 'notes.old.1')); writeFileSync(join(f.home, 'photo.old.jpg'), 'x');
  symlinkSync(target, join(f.home, `grz.${'a'.repeat(64)}.old.7`));
  symlinkSync(target, join(f.home, '.grz-verify.LINK01'));
  mkdirSync(join(f.home, `grz.${'b'.repeat(64)}.old.9`)); mkdirSync(join(f.home, '.grz-verify.Zz9abc'));
  const g = fixture({ tree: { 'src/gateway.mjs': 'js-sd20' } });
  const r = verifyAs(f, g); assert.equal(r.status, 0, r.stdout + r.stderr);
  const left = readdirSync(f.home);
  for (const n of ['notes.old.1', 'photo.old.jpg', `grz.${'a'.repeat(64)}.old.7`, '.grz-verify.LINK01']) assert.ok(left.includes(n), `${n} must survive: ${left}`);
  assert.ok(!left.includes(`grz.${'b'.repeat(64)}.old.9`) && !left.includes('.grz-verify.Zz9abc'), left.join(','));
  assert.ok(existsSync(join(target, 'keep')), 'symlink target untouched');
});
test('SD-24: previous is chosen from the install record, not mtime', { skip: !hasBash }, () => {
  const f = installed();
  const decoy = join(f.home, 'grz.' + '3'.repeat(64)); mkdirSync(decoy);
  utimesSync(decoy, new Date(4e12), new Date(4e12)); // far newer mtime than the real previous
  utimesSync(join(f.home, `grz.${f.manSha}`), new Date(1000e3), new Date(1000e3));
  const g = fixture({ tree: { 'src/gateway.mjs': 'js-sd24' } });
  const r = verifyAs(f, g); assert.equal(r.status, 0, r.stdout + r.stderr);
  const left = readdirSync(f.home);
  assert.ok(left.includes(`grz.${f.manSha}`), 'recorded previous kept'); assert.ok(!left.includes(decoy.split('/').pop()), 'unrecorded decoy swept');
  const hist = join(f.home, '.green-roomz-state', 'install-history');
  assert.deepEqual(readFileSync(hist, 'utf8').trim().split('\n'), [`grz.${f.manSha}`, `grz.${g.manSha}`]);
  assert.equal(statSync(hist).mode & 0o777, 0o600);
});
test('SD-24: a live install lock refuses; a stale one is taken over; lock released after', { skip: !hasBash }, () => {
  const f = fixture(); mkdirSync(f.home, { recursive: true });
  const lock = join(f.home, '.grz-install.lock'); mkdirSync(lock); writeFileSync(join(lock, 'pid'), String(process.pid));
  let r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /holds .*\.grz-install\.lock; refusing/);
  writeFileSync(join(lock, 'pid'), '999999999');
  r = run(f); assert.equal(r.code, 0, r.out); assert.match(r.out, /taking over stale lock/);
  assert.equal(existsSync(lock), false);
});
test('SD-25: same sha already current and intact -> no copy, no flip', { skip: !hasBash }, () => {
  const f = installed(); const live = join(f.home, `grz.${f.manSha}`);
  utimesSync(live, new Date(1000e3), new Date(1000e3)); const ino = statSync(live).ino;
  const r = run(f); assert.equal(r.code, 0, r.out); assert.match(r.out, /already current and intact; skipping copy and flip/);
  assert.equal(statSync(live).ino, ino); assert.equal(statSync(live).mtimeMs, 1000e3);
  assert.equal(readlinkSync(f.cur), `grz.${f.manSha}`);
  f.put(f.rt, 'bin/libggml.so', 'TAMPERED-LIVE');
  const r2 = run(f); assert.equal(r2.code, 0, r2.out); assert.match(r2.out, /does not re-verify; reinstalling/);
  assert.equal(readFileSync(join(f.rt, 'bin/libggml.so'), 'utf8'), 'SO');
});
test('SD-21: verifier refuses a $HOME that resolves onto shared storage (shared prefix helper)', { skip: !hasBash }, () => {
  const f = fixture(); mkdirSync(f.home, { recursive: true });
  const pre = join(f.root, 'prefixes.txt'); writeFileSync(pre, `${f.home}\n`);
  const r = spawnSync('bash', [SCRIPT, f.stage, f.tsrc], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: f.manSha, GRZ_SHARED_PREFIXES_EXTRA: pre } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /on shared storage; refusing/);
});

test('SD-21: setup refuses a $HOME on shared storage; runner refuses a current dir on shared storage', { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), 'grz-ss-')); const pre = join(root, 'p.txt'); writeFileSync(pre, `${root}\n`);
  const r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, GRZ_SHARED_PREFIXES_EXTRA: pre } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /on shared storage; refusing/);
  const f = realTree(); assert.equal(run(f).code, 0);
  const p2 = join(f.root, 'p2.txt'); writeFileSync(p2, `${f.home}/grz.\n`); // matches nothing (prefix must be exact dir)
  writeFileSync(p2, `${f.home}\n`);
  const rr = spawnSync('bash', [join(f.cur, 'tree', 'scripts', 'note9-run-llama-server.termux.sh'), '--version'], { encoding: 'utf8', env: { PATH: stubGetprop(join(f.root, 'gpx'), 28), HOME: f.home, TERMUX_VERSION: '0.118', GRZ_MANIFEST_SHA256: f.manSha, GRZ_SHARED_PREFIXES_EXTRA: p2 } });
  assert.notEqual(rr.status, 0); assert.match(rr.stderr, /on shared storage; refusing/);
});
