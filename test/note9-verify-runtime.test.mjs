import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, statSync, lstatSync, readlinkSync, readdirSync, chmodSync, renameSync, utimesSync, unlinkSync, realpathSync } from 'node:fs';
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
  assert.notEqual(r.code, 0); assert.match(r.out, /no entries|has no hash lines; refusing/);
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
test('NOTE9-PID: kill -9 re-checks cmdline; pid-reuse after SIGTERM is not SIGKILL\'d', { skip: !hasBash || !existsSync('/proc/self/cmdline') }, () => {
  const root = mkdtempSync(join(tmpdir(), 'grz-pid9-'));
  const pf = join(root, 'grz-serve.pid');
  const bin = join(root, 'bin'); mkdirSync(bin, { recursive: true });
  // Looks like our serve in cmdline; on TERM, exec sleep so the pid is reused by a non-serve process.
  writeFileSync(join(bin, 'green-roomz.mjs'), `#!/bin/bash\ntrap 'exec sleep 60' TERM\nwhile true; do sleep 1; done\n`, { mode: 0o755 });
  const script = `
    . "${PIDLIB}"
    "${bin}/green-roomz.mjs" serve & sp=$!
    grz_write_pid $sp
    grz_stop_serve
    if kill -0 $sp 2>/dev/null; then echo REUSED_ALIVE; else echo REUSED_DEAD; fi
    kill -9 $sp 2>/dev/null || true
  `;
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, GRZ_SERVE_PIDFILE: pf } });
  assert.match(r.stdout, /REUSED_ALIVE/, r.stdout + r.stderr);
  assert.match(r.stderr, /no longer green-roomz serve after wait; not sending SIGKILL/);
  const src = readFileSync(PIDLIB, 'utf8');
  assert.match(src, /grz_pid_is_serve/);
  assert.match(src, /Re-check before SIGKILL|re-check/i);
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
test('NODE: npm-deps none — node_modules (even with a listed .node) is refused by the verifier', { skip: !hasBash }, () => {
  const f = fixture({ tree: { 'src/gateway.mjs': 'js', 'node_modules/addon/build/addon.node': 'ELF-NODE', 'node_modules/addon/index.js': 'x' } });
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /node_modules present/);
  assert.equal(existsSync(join(f.home, `grz.${f.manSha}`)), false);
});
test('NODE: runner refuses an unlisted .node dropped into the installed tree (outside node_modules too)', { skip: !hasBash }, () => {
  const f = installed(); chmodSync(join(f.home, `grz.${f.manSha}`), 0o700);
  f.put(f.dst, 'src/x.node', 'X');
  const r = runRunner(f); assert.notEqual(r.code, 0); assert.match(r.out, /tree\/src\/x\.node \(native addon\) is not listed/);
});

// Fixture tree carrying the real scripts + src so refresh/restart run end to end (stub serve).
function realTree(extra = {}) {
  const tree = { 'bin/green-roomz.mjs': 'console.log("serve-stub", process.argv.slice(2).join(" ")); console.error("serve-stub-err");\n', ...extra };
  for (const n of ['note9-verify-runtime.sh', 'note9-common.sh', 'note9-serve-pid.sh', 'note9-restart-serve.sh', 'note9-refresh-src.sh', 'note9-run-llama-server.termux.sh', 'note9-shared-storage.sh']) tree[`scripts/${n}`] = readFileSync(join(SCRIPTS, n), 'utf8');
  tree['config/shared-storage-prefixes.txt'] = readFileSync(join(REPO, 'config', 'shared-storage-prefixes.txt'), 'utf8');
  for (const rel of spawnSync('bash', ['-c', 'cd src && find . -type f -name "*.mjs" -printf "%P\\n"'], { cwd: REPO, encoding: 'utf8' }).stdout.trim().split('\n')) tree[`src/${rel}`] = readFileSync(join(REPO, 'src', rel), 'utf8');
  return fixture({ files: { 'bin/llama-server': 'ELF', 'bin/libggml.so': 'SO', 'models/m.gguf': 'GGUF' }, tree });
}
const envFor = (f, extra = {}) => ({ PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: f.manSha, GRZ_RESTART_NO_PROBE: '1', GREEN_ROOMZ_API_KEY: 'test-key-0123456789abcdef', ...extra });
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

test('SD-22 (= N5a): on Android, empty / non-numeric / missing getprop refused in BOTH setup and runner', { skip: !hasBash }, () => {
  const f = installed();
  const base = process.env.PATH.split(':').filter((d) => !existsSync(join(d, 'getprop'))).join(':');
  const un = stubUname(join(f.root, 'sd22-un'));
  const cases = [
    ['empty', (d) => stubGetprop(d, "''"), /empty\/non-numeric/],
    ['non-numeric', (d) => stubGetprop(d, 'Q'), /empty\/non-numeric/],
    ['missing', () => base, /getprop not found but this is Android/],
  ];
  for (const [name, mk, re] of cases) {
    for (const android of [{ TERMUX_VERSION: '0.118' }, { TERMUX_VERSION: '', unamePath: un }]) {
      const p = mk(join(f.root, `sd22-${name}-${android.unamePath ? 'u' : 't'}`));
      const PATH = android.unamePath ? `${android.unamePath}:${p}` : p;
      const env = { TERMUX_VERSION: android.TERMUX_VERSION };
      const rr = runRunner(f, { PATH, ...env });
      assert.notEqual(rr.code, 0, `runner ${name}`); assert.match(rr.out, re, `runner ${name}`);
      const sh = mkdtempSync(join(tmpdir(), 'grz-sd22-'));
      const rs = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH, HOME: sh, ...env } });
      assert.notEqual(rs.status, 0, `setup ${name}`); assert.match(rs.stderr, re, `setup ${name}`);
    }
  }
});

function packRepo() {
  // Pack = git archive of HEAD: build a throwaway clean repo holding the packed files.
  const t = mkdtempSync(join(tmpdir(), 'grz-pack-')); const g = join(t, 'repo');
  const files = ['config/note9-runtime.SHA256SUMS', 'config/shared-storage-prefixes.txt', 'scripts/note9-common.sh', 'scripts/note9-shared-storage.sh', 'scripts/note9-termux-setup.sh', 'scripts/note9-verify-runtime.sh', 'scripts/note9-extract-release.sh', 'scripts/note9-pack-release.sh'];
  for (const f of files) { mkdirSync(dirname(join(g, f)), { recursive: true }); writeFileSync(join(g, f), readFileSync(join(REPO, f))); }
  const gi = (...a) => spawnSync('git', ['-C', g, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '@0 +0000', GIT_COMMITTER_DATE: '@0 +0000', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  gi('init', '-q'); gi('add', '-A'); gi('commit', '-qm', 'x');
  return { t, g, pack: join(g, 'scripts', 'note9-pack-release.sh') };
}
test('PACK: git archive of HEAD, deterministic, holds setup+verifier+extract+helpers+manifest, prints both shas; dirty tree refused', { skip: !hasBash }, () => {
  const { t, g, pack } = packRepo();
  const a = spawnSync('bash', [pack, join(t, 'a.tar.gz')], { encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  const b = spawnSync('bash', [pack, join(t, 'b.tar.gz')], { encoding: 'utf8', env: { ...process.env, TZ: 'Asia/Tokyo', LC_ALL: 'C' } });
  assert.equal(b.status, 0, b.stderr);
  assert.equal(readFileSync(join(t, 'a.tar.gz')).equals(readFileSync(join(t, 'b.tar.gz'))), true, 'byte-identical');
  const tsha = sha(readFileSync(join(t, 'a.tar.gz')));
  assert.match(a.stdout, new RegExp(`tarball  sha256=${tsha}`));
  assert.match(a.stdout, new RegExp(`manifest sha256=${sha(readFileSync(join(REPO, 'config', 'note9-runtime.SHA256SUMS')))}`));
  const list = spawnSync('tar', ['tzf', join(t, 'a.tar.gz')], { encoding: 'utf8' }).stdout.trim().split('\n').filter((l) => !l.endsWith('/'));
  assert.deepEqual(list, ['config/note9-runtime.SHA256SUMS', 'config/shared-storage-prefixes.txt', 'scripts/note9-common.sh', 'scripts/note9-extract-release.sh', 'scripts/note9-shared-storage.sh', 'scripts/note9-termux-setup.sh', 'scripts/note9-verify-runtime.sh']);
  const buf = readFileSync(join(t, 'a.tar.gz')); assert.equal(buf[4] | buf[5] | buf[6] | buf[7], 0, 'gzip -n: no mtime');
  assert.match(readFileSync(pack, 'utf8'), /git -C "\$ROOT" -c tar\.umask=0022 archive --format=tar HEAD/);
  writeFileSync(join(g, 'scripts', 'note9-common.sh'), '# dirty\n');
  const d = spawnSync('bash', [pack, join(t, 'c.tar.gz')], { encoding: 'utf8' });
  assert.notEqual(d.status, 0); assert.match(d.stderr, /working tree is dirty/); assert.equal(existsSync(join(t, 'c.tar.gz')), false);
  const setup = readFileSync(SETUP, 'utf8');
  assert.match(setup, /bash "\$SELF_DIR\/note9-verify-runtime\.sh"/);
  assert.doesNotMatch(setup, /\$TREE_SRC\/scripts\/note9-verify-runtime/);
});
const EXTRACT = join(SCRIPTS, 'note9-extract-release.sh');
test('SD-31: extract lists first (GNU tar only), refuses .., absolute, symlink/hardlink/dev entries; fresh 0700 dest; --no-same-owner', { skip: !hasBash }, () => {
  const { t, pack } = packRepo();
  assert.equal(spawnSync('bash', [pack, join(t, 'ok.tar.gz')], { encoding: 'utf8' }).status, 0);
  const ex = (tb, dest, env = {}) => spawnSync('bash', [EXTRACT, tb, dest], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  let r = ex(join(t, 'ok.tar.gz'), join(t, 'out')); assert.equal(r.status, 0, r.stderr);
  assert.equal(statSync(join(t, 'out')).mode & 0o777, 0o700); assert.ok(existsSync(join(t, 'out', 'scripts', 'note9-termux-setup.sh')));
  r = ex(join(t, 'ok.tar.gz'), join(t, 'out')); assert.notEqual(r.status, 0); assert.match(r.stderr, /already exists; extract into a fresh folder/);
  const mk = (name, script) => { const w = join(t, `w-${name}`); mkdirSync(w); spawnSync('bash', ['-c', `cd "${w}" && ${script}`]); return join(t, `${name}.tar.gz`); };
  const bad = {
    dotdot: mk('dotdot', `mkdir a && echo x > x && tar -czf ../dotdot.tar.gz --transform='s,^x$,a/../../evil,' x`),
    abs: mk('abs', `echo x > x && tar -czf ../abs.tar.gz --transform='s,^x$,/tmp/evil,' -P x`),
    sym: mk('sym', `ln -s /etc/passwd s && tar -czf ../sym.tar.gz s`),
    hard: mk('hard', `echo x > a && ln a b && tar -czf ../hard.tar.gz a b`),
    fifo: mk('fifo', `mkfifo p && tar -czf ../fifo.tar.gz p`),
  };
  for (const [k, tb] of Object.entries(bad)) {
    r = ex(tb, join(t, `o-${k}`)); assert.notEqual(r.status, 0, k); assert.match(r.stderr, /refusing/, k); assert.equal(existsSync(join(t, `o-${k}`)), false, k);
  }
  const toy = join(t, 'toy', 'bin'); mkdirSync(toy, { recursive: true }); writeFileSync(join(toy, 'tar'), '#!/bin/sh\necho "toybox 0.8.9"\n', { mode: 0o755 });
  r = ex(join(t, 'ok.tar.gz'), join(t, 'o-toy'), { PREFIX: join(t, 'toy') }); assert.notEqual(r.status, 0); assert.match(r.stderr, /not GNU tar \(toybox\/busybox refused\)/);
  const ext = readFileSync(EXTRACT, 'utf8'); assert.match(ext, /TAR=\$PREFIX\/bin\/tar/); assert.match(ext, /--no-same-owner/); assert.match(ext, /mkdir -m 700/);
  const doc = readFileSync(join(REPO, 'docs', 'note9-termux.md'), 'utf8'); assert.match(doc, /TAR=\$PREFIX\/bin\/tar/); assert.match(doc, /\$TAR -tvzf "\$T"/); assert.match(doc, /--no-same-owner/); assert.match(doc, /mkdir -m 700/);
});
test('SD-31: setup refuses a release folder containing a symlink; setup uses $PREFIX/bin/find', { skip: !hasBash }, () => {
  const s = readFileSync(SETUP, 'utf8');
  assert.match(s, /FIND=\$PREFIX\/bin\/find/); assert.match(s, /nm=\$\("\$FIND" "\$TREE_SRC"/); assert.doesNotMatch(s, /\$\(find /);
  const { t, pack } = packRepo(); spawnSync('bash', [pack, join(t, 'ok.tar.gz')]);
  const rel = join(t, 'rel'); assert.equal(spawnSync('bash', [EXTRACT, join(t, 'ok.tar.gz'), rel]).status, 0);
  symlinkSync('/etc/passwd', join(rel, 'config', 'evil'));
  const r = spawnSync('bash', [join(rel, 'scripts', 'note9-termux-setup.sh')], { encoding: 'utf8', env: { PATH: stubGetprop(join(t, 'gp'), 28), HOME: t, TERMUX_VERSION: '0.118' } });
  assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /non-regular entry .*evil in the release folder; .*refusing/);
});

// --- gen-manifest / npm-deps none / SD-26 / unverified .old sweep / stage root ----------------
const GEN = join(SCRIPTS, 'note9-gen-manifest.sh');
function genStage({ bin = true, lib = false, model = true, tree = true } = {}) {
  const t = mkdtempSync(join(tmpdir(), 'grz-gen-')); const st = join(t, 'stage'); const tr = join(t, 'tree'); mkdirSync(st); mkdirSync(tr);
  if (bin) { mkdirSync(join(st, 'bin')); writeFileSync(join(st, 'bin', 'llama-server'), 'ELF'); writeFileSync(join(st, 'bin', 'libggml.so'), 'SO'); }
  if (lib) { mkdirSync(join(st, 'lib')); writeFileSync(join(st, 'lib', 'libx.so'), 'X'); }
  if (model) { mkdirSync(join(st, 'models')); writeFileSync(join(st, 'models', 'm.gguf'), 'GGUF'); }
  if (tree) { mkdirSync(join(tr, 'src')); writeFileSync(join(tr, 'src', 'a.mjs'), 'a'); }
  return { t, st, tr, out: join(t, 'SUMS') };
}
const gen = (g, extra = []) => spawnSync('bash', [GEN, ...extra, g.st, g.tr, g.out], { encoding: 'utf8' });
test('GEN: lists only existing dirs; header npm-deps: none; prints sha + per-section counts', { skip: !hasBash }, () => {
  const g = genStage(); const r = gen(g); assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /No such file/); // lib/ absent, not hidden-and-ignored: never passed to find
  const text = readFileSync(g.out, 'utf8');
  assert.match(text, /^# npm-deps: none$/m); assert.doesNotMatch(text, /DRYRUN/);
  assert.match(r.stdout, new RegExp(`sha256=${sha(text)}  bin=2 lib=0 model=1 tree=1`));
  assert.match(text, /  tree\/src\/a\.mjs$/m);
});
test('GEN: refuses zero tree/ lines, missing model (unless --allow-no-model -> DRYRUN), node_modules, and surfaces errors', { skip: !hasBash }, () => {
  let g = genStage({ tree: false }); let r = gen(g); assert.notEqual(r.status, 0); assert.match(r.stderr, /zero tree\/ lines/); assert.equal(existsSync(g.out), false);
  g = genStage({ model: false }); r = gen(g); assert.notEqual(r.status, 0); assert.match(r.stderr, /no models\/ line/);
  r = gen(g, ['--allow-no-model']); assert.equal(r.status, 0, r.stderr); assert.match(readFileSync(g.out, 'utf8'), /^# DRYRUN/); assert.match(r.stdout, /model=0/);
  g = genStage(); mkdirSync(join(g.tr, 'node_modules', 'x'), { recursive: true }); writeFileSync(join(g.tr, 'node_modules', 'x', 'i.js'), '1');
  r = gen(g); assert.notEqual(r.status, 0); assert.match(r.stderr, /node_modules present/);
  if (process.getuid?.() !== 0) {
    g = genStage(); chmodSync(join(g.st, 'bin', 'libggml.so'), 0o000);
    r = gen(g); assert.notEqual(r.status, 0, 'unreadable file must fail, not be skipped'); assert.equal(existsSync(g.out), false);
  }
});
test('NPM: verifier, setup and runner refuse any node_modules dir (npm-deps: none); setup never runs npm', { skip: !hasBash }, () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0); assert.equal(existsSync(join(REPO, 'package-lock.json')), false);
  assert.match(readFileSync(join(REPO, 'config', 'note9-runtime.SHA256SUMS'), 'utf8'), /^# npm-deps: none$/m);
  for (const sc of ['note9-termux-setup.sh', 'note9-refresh-src.sh', 'note9-restart-serve.sh', 'note9-verify-runtime.sh', 'note9-common.sh']) {
    assert.doesNotMatch(readFileSync(join(SCRIPTS, sc), 'utf8').replace(/^\s*#.*$/gm, ''), /\bnpm\b(?!-deps)/, sc);
  }
  const f = fixture({ tree: { 'src/gateway.mjs': 'js', 'node_modules/x/index.js': '1' } });
  const r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /node_modules present/);
  const g = installed(); mkdirSync(join(g.home, `grz.${g.manSha}`, 'tree', 'node_modules'));
  const rr = runRunner(g); assert.notEqual(rr.code, 0); assert.match(rr.out, /node_modules present/);
  const setupSrc = readFileSync(SETUP, 'utf8'); assert.match(setupSrc, /node_modules present in staged tree/);
});
test('SD-26: empty pid = held (refused); stale lock renamed aside then re-acquired atomically', { skip: !hasBash }, () => {
  const f = fixture(); mkdirSync(f.home, { recursive: true });
  const lock = join(f.home, '.grz-install.lock'); mkdirSync(lock);
  let r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /held \(pid not written yet\); refusing/);
  writeFileSync(join(lock, 'pid'), ''); r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /pid not written yet/);
  writeFileSync(join(lock, 'pid'), 'abc'); r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /bad pid/);
  writeFileSync(join(lock, 'pid'), '999999999'); r = run(f); assert.equal(r.code, 0, r.out); assert.match(r.out, /taking over stale lock/);
  assert.equal(readdirSync(f.home).some((n) => n.startsWith('.grz-install.lock')), false, 'lock and aside both gone');
  const common = readFileSync(join(SCRIPTS, 'note9-common.sh'), 'utf8');
  assert.match(common, /"\$MV_BIN" -T -- "\$GRZ_LOCK" "\$ASIDE"/);
  assert.match(readFileSync(SCRIPT, 'utf8'), /grz_install_lock_acquire/);
});
test('SWEEP: grz.unverified.<t>.<p>.old.<n> real dirs are swept too', { skip: !hasBash }, () => {
  const f = installed(); const n = 'grz.unverified.1700000000.123.old.9'; mkdirSync(join(f.home, n));
  const g = fixture({ tree: { 'src/gateway.mjs': 'js-unv' } });
  const r = spawnSync('bash', [SCRIPT, g.stage, g.tsrc], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: g.manSha } });
  assert.equal(r.status, 0, r.stderr); assert.equal(existsSync(join(f.home, n)), false);
});
test('STAGE: refresh classifies GRZ_STAGE_ROOT with the shared helper (input only) and refuses a verifier inside it', { skip: !hasBash }, () => {
  const f = realTree(); assert.equal(run(f).code, 0);
  const g = realTree({ 'src/new2.mjs': 'export {};\n' });
  const pre = join(f.root, 'p.txt'); writeFileSync(pre, `${g.stage}\n`);
  const r = spawnSync('bash', [join(f.dst, 'scripts/note9-refresh-src.sh')], { encoding: 'utf8', env: envFor(f, { GRZ_STAGE_ROOT: g.stage, GRZ_MANIFEST_SHA256: g.manSha, GRZ_REFRESH_NO_RESTART: '1', GRZ_SHARED_PREFIXES_EXTRA: pre }) });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /on shared storage \(input only; never executed\)/);
  const src = readFileSync(join(SCRIPTS, 'note9-refresh-src.sh'), 'utf8');
  assert.match(src, /is inside stage root .*refusing/);
});
test('SETUP:83: setup refuses to run from shared/adb storage (must run from the extracted release tarball)', { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), 'grz-s83-')); const pre = join(root, 'p.txt'); writeFileSync(pre, `${SCRIPTS}\n`);
  const r = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, GRZ_SHARED_PREFIXES_EXTRA: pre } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /shared\/adb-writable storage.*release tarball/);
});

// KEY: Brian 2026-11-02 — phones always require an API key, loopback included.
function keyed() {
  const f = fixture({ files: { 'bin/llama-server': '#!/bin/sh\necho "ARGV=$*"\nenv | grep "^LLAMA" | sed "s/^/ENV=/"\n', 'bin/libggml.so': 'SO', 'models/m.gguf': 'GGUF' } });
  const r = run(f); assert.equal(r.code, 0, r.out);
  mkdirSync(join(f.cur, 'tree', 'src'), { recursive: true });
  for (const m of readdirSync(join(REPO, 'src'))) if (m.endsWith('.mjs')) writeFileSync(join(f.cur, 'tree', 'src', m), readFileSync(join(REPO, 'src', m)));
  const st = join(f.root, 'home', '.green-roomz-state'); mkdirSync(st, { recursive: true, mode: 0o700 }); chmodSync(st, 0o700);
  return { f, st };
}
const runSrv = (f, env = {}, args = ['--host', '127.0.0.1', '--port', '8081']) => {
  const r = spawnSync('bash', [RUNNER, ...args], { encoding: 'utf8', env: { PATH: stubGetprop(join(f.root, 'gpk'), 28), HOME: join(f.root, 'home'), TERMUX_VERSION: '0.118', GRZ_MANIFEST_SHA256: f.manSha, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
};
test('KEY: runner refuses to start llama-server on loopback without a key; --version probe still allowed', { skip: !hasBash }, () => {
  const { f } = keyed();
  let r = runSrv(f); assert.notEqual(r.code, 0); assert.match(r.out, /no API key .*loopback included; refusing/); assert.doesNotMatch(r.out, /ARGV=/);
  r = runSrv(f, {}, ['--version']); assert.equal(r.code, 0, r.out); assert.match(r.out, /ARGV=--version$/m);
});
test('KEY: GREEN_ROOMZ_API_KEY -> 0600 file passed via --api-key-file; key never in argv', { skip: !hasBash }, () => {
  const { f, st } = keyed(); const secret = 'sekrit-' + 'a'.repeat(20);
  const r = runSrv(f, { GREEN_ROOMZ_API_KEY: secret }); assert.equal(r.code, 0, r.out);
  const kf = join(st, 'llama-server.key');
  assert.match(r.out, new RegExp(`ARGV=--host 127\\.0\\.0\\.1 --port 8081 --api-key-file ${kf.replace(/[.]/g, '\\.')}$`, 'm'));
  assert.ok(!r.out.includes(secret)); assert.equal(statSync(kf).mode & 0o777, 0o600); assert.equal(readFileSync(kf, 'utf8'), secret, 'no trailing newline');
});
test('KEY: override api_key_file is validated and passed; bad mode or caller --api-key refused', { skip: !hasBash }, () => {
  const { f, st } = keyed(); const kf = join(f.root, 'home', 'k.key');
  writeFileSync(kf, 'k'.repeat(32), { mode: 0o600 });
  writeFileSync(join(st, 'agents.note9.local.json'), JSON.stringify({ api_key_file: kf }), { mode: 0o600 });
  let r = runSrv(f); assert.equal(r.code, 0, r.out); assert.match(r.out, new RegExp(`--api-key-file ${kf.replace(/[.]/g, '\\.')}$`, 'm'));
  r = runSrv(f, {}, ['--api-key', 'x']); assert.notEqual(r.code, 0); assert.match(r.out, /caller passed --api-key/);
  r = runSrv(f, {}, ['--api-key-file=/tmp/x']); assert.notEqual(r.code, 0); assert.match(r.out, /caller passed --api-key-file/);
  chmodSync(kf, 0o644); r = runSrv(f, { GREEN_ROOMZ_API_KEY: 'fallback-not-used' }); assert.notEqual(r.code, 0); assert.match(r.out, /api_key_file refused/);
});
test('KEY: grz_key_generate makes a 0600 64-hex key once; grz_key_check refuses with no key', { skip: !hasBash }, () => {
  const root = mkdtempSync(join(tmpdir(), 'grz-key-')); const kf = join(root, 'api.key');
  const COMMON = join(REPO, 'scripts', 'note9-common.sh');
  let r = spawnSync('bash', ['-c', `. "${COMMON}"; grz_key_generate "${kf}" && grz_key_generate "${kf}"`], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root } });
  assert.equal(r.status, 0, r.stderr); const k = readFileSync(kf, 'utf8'); assert.match(k, /^[0-9a-f]{64}$/); assert.equal(statSync(kf).mode & 0o777, 0o600);
  r = spawnSync('bash', ['-c', `. "${COMMON}"; grz_key_generate "${kf}"; cat "${kf}"`], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root } });
  assert.equal(r.stdout, k, 'existing key is not overwritten');
  r = spawnSync('bash', ['-c', `. "${COMMON}"; grz_key_check "${REPO}"`], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /no API key.*loopback included; refusing/);
  r = spawnSync('bash', ['-c', `. "${COMMON}"; grz_key_check "${REPO}"`], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root, GREEN_ROOMZ_API_KEY: 'x'.repeat(24) } });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, 'env');
});
test('KEY: setup and restart wire the key (generate, override api_key_file, check before serve, bearer probe)', () => {
  const s = readFileSync(SETUP, 'utf8'); const rs = readFileSync(join(REPO, 'scripts', 'note9-restart-serve.sh'), 'utf8');
  assert.match(s, /grz_key_generate "\$KEYF"/); assert.match(s, /api_key_file: process\.env\.GRZ_OVR_KEY/);
  assert.ok(s.indexOf('grz_key_check') < s.indexOf('grz_serve_start "$PORT"')); assert.doesNotMatch(s, /fetch\('http/);
  assert.ok(rs.indexOf('grz_key_check') < rs.indexOf('grz_stop_serve\n')); assert.doesNotMatch(rs, /fetch\('http/);
});
test('GEN: --allow-no-model accepted in any position; unknown options and wrong arity refused', { skip: !hasBash }, () => {
  for (const pos of [1, 2, 3]) {
    const g = genStage({ model: false }); const a = [g.st, g.tr, g.out]; a.splice(pos, 0, '--allow-no-model');
    const r = spawnSync('bash', [GEN, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); assert.match(readFileSync(g.out, 'utf8'), /^# DRYRUN/);
  }
  const g = genStage();
  let r = spawnSync('bash', [GEN, g.st, '--bogus', g.tr, g.out], { encoding: 'utf8' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /unknown option --bogus/);
  r = spawnSync('bash', [GEN, g.st, g.tr], { encoding: 'utf8' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /usage:/);
});

test('SD-29: verifier refuses a DRYRUN manifest or one with no models/ line, even with a matching anchor', { skip: !hasBash }, () => {
  let f = fixture({ files: { 'bin/llama-server': 'ELF', 'bin/libggml.so': 'SO' } });
  let r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /has no models\/ line; refusing/); assert.equal(existsSync(f.cur), false);
  r = run(f, { GRZ_ALLOW_UNVERIFIED_RUNTIME: '1' }); assert.notEqual(r.code, 0); assert.match(r.out, /no models\/ line/);
  f = fixture({ manifest: ['# DRYRUN: no model line (--allow-no-model); not a release manifest', `${sha('ELF')}  bin/llama-server`, `${sha('GGUF')}  models/m.gguf`] });
  r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /DRYRUN manifest .*refusing/);
});
test('SD-29: runner refuses a DRYRUN / model-less manifest in an installed tree', { skip: !hasBash }, () => {
  const f = installed(); const man = join(f.cur, 'tree', 'config', 'note9-runtime.SHA256SUMS');
  const orig = readFileSync(man, 'utf8');
  const restamp = (text) => { chmodSync(man, 0o644); writeFileSync(man, text); const h = sha(text); writeFileSync(join(f.cur, '.verified'), h); return h; };
  // rename the install dir to match the new sha so only SD-29 can refuse
  const reinstall = (text) => { const h = restamp(text); const nd = join(f.home, `grz.${h}`); renameSync(realpathSync(f.cur), nd); unlinkSync(f.cur); symlinkSync(nd, f.cur); return h; };
  let h = reinstall('# DRYRUN\n' + orig);
  let r = runRunner(f, { GRZ_MANIFEST_SHA256: h }); assert.notEqual(r.code, 0); assert.match(r.out, /DRYRUN manifest; refusing to start/);
  h = reinstall(orig.split('\n').filter((l) => !/ models\//.test(l)).join('\n'));
  r = runRunner(f, { GRZ_MANIFEST_SHA256: h }); assert.notEqual(r.code, 0); assert.match(r.out, /no models\/ line; refusing to start/);
});
test('SD-30/R1: stale-lock takeover aborts on pid mismatch; restores aside→LOCK when vacant', { skip: !hasBash }, () => {
  const f = fixture(); mkdirSync(f.home, { recursive: true });
  const lock = join(f.home, '.grz-install.lock'); mkdirSync(lock); writeFileSync(join(lock, 'pid'), '999999999');
  const bin = join(f.root, 'mvstub'); mkdirSync(bin);
  const realMv = spawnSync('bash', ['-c', 'command -v mv'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(bin, 'mv'), `#!/bin/bash\n"${realMv}" "$@"; rc=$?\nfor a in "$@"; do last=$a; done\ncase "$last" in *.grz-install.lock.stale.*) echo 424242 > "$last/pid";; esac\nexit $rc\n`, { mode: 0o755 });
  const r = run(f, { PATH: `${bin}:${process.env.PATH}` });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /lock changed hands during takeover \(pid '999999999' -> '424242'\).*restored to .*\.grz-install\.lock when vacant.*refusing/);
  // R1: vacant name gets the live holder's lock back (pid 424242 from the stub).
  assert.equal(existsSync(lock), true, 'lock restored when vacant');
  assert.equal(readFileSync(join(lock, 'pid'), 'utf8').trim(), '424242');
  assert.equal(readdirSync(f.home).filter((n) => n.startsWith('.grz-install.lock.stale.')).length, 0);
  const common = readFileSync(join(SCRIPTS, 'note9-common.sh'), 'utf8');
  assert.match(common, /"\$MV_BIN" -T -- "\$ASIDE" "\$GRZ_LOCK"/);
});

test('KEY: runner unsets LLAMA_API_KEY, LLAMA_ARG_API_KEY_FILE and every LLAMA_ARG_* before exec', { skip: !hasBash }, () => {
  const { f } = keyed();
  const r = runSrv(f, { GREEN_ROOMZ_API_KEY: 'z'.repeat(24), LLAMA_API_KEY: 'evil', LLAMA_ARG_API_KEY_FILE: '/tmp/evil', LLAMA_ARG_HOST: '0.0.0.0', LLAMA_ARG_N_GPU_LAYERS: '99', LLAMA_CACHE: 'keep' });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /ENV=LLAMA_API_KEY=|ENV=LLAMA_ARG_/);
  assert.match(r.out, /ENV=LLAMA_CACHE=keep/, 'non-ARG LLAMA_ vars are left alone');
});
test('KEY: runner refuses GREEN_ROOMZ_API_KEY with whitespace/CR/LF', { skip: !hasBash }, () => {
  const { f } = keyed();
  const r = runSrv(f, { GREEN_ROOMZ_API_KEY: 'abc\r' + 'x'.repeat(20) }); assert.notEqual(r.code, 0); assert.match(r.out, /whitespace\/CR\/LF; refusing/);
});

test('Boundary nit: verifier refuses a manifest with no hash lines at all (comments only)', { skip: !hasBash }, () => {
  const f = fixture({ manifest: ['# npm-deps: none', '# nothing listed'] });
  let r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /has no hash lines; refusing/);
  r = run(f, { GRZ_ALLOW_UNVERIFIED_RUNTIME: '1' }); assert.notEqual(r.code, 0); assert.match(r.out, /has no hash lines/);
});


test('R1: two concurrent installs (no flock): exactly one wins; loser’s release does not delete winner’s lock', { skip: !hasBash }, () => {
  const f = fixture(); mkdirSync(f.home, { recursive: true });
  // Hold a live lock as this test process so both children refuse, then free it and race two installs.
  const lock = join(f.home, '.grz-install.lock'); mkdirSync(lock); writeFileSync(join(lock, 'pid'), String(process.pid));
  let r = run(f); assert.notEqual(r.code, 0); assert.match(r.out, /holds .*\.grz-install\.lock; refusing/);
  writeFileSync(join(lock, 'pid'), '999999999'); // dead → both may race takeover
  const out1 = join(f.root, 'c1.out'); const out2 = join(f.root, 'c2.out');
  const raced = spawnSync('bash', ['-c', `
    unset PREFIX
    bash "${SCRIPT}" "${f.stage}" "${f.tsrc}" >"${out1}" 2>&1 & p1=$!
    bash "${SCRIPT}" "${f.stage}" "${f.tsrc}" >"${out2}" 2>&1 & p2=$!
    wait $p1; e1=$?
    wait $p2; e2=$?
    echo "E1=$e1 E2=$e2"
  `], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: f.manSha } });
  assert.equal(raced.status, 0, raced.stdout + raced.stderr);
  const m = /E1=(\d+) E2=(\d+)/.exec(raced.stdout);
  assert.ok(m, raced.stdout);
  const codes = [Number(m[1]), Number(m[2])].sort();
  assert.deepEqual(codes, [0, 1], `expected one win one refuse, got ${m[0]}; out1=${readFileSync(out1,'utf8').slice(-400)} out2=${readFileSync(out2,'utf8').slice(-400)}`);
  assert.equal(existsSync(lock), false, 'winner released its own lock');
  assert.equal(readlinkSync(f.cur), `grz.${f.manSha}`);
  // Owner-token cleanup: simulate a holder whose lock dir was stolen; release must not rm the new owner.
  mkdirSync(lock); writeFileSync(join(lock, 'pid'), '111');
  const rel = spawnSync('bash', ['-c', `
    . "${join(SCRIPTS, 'note9-common.sh')}"
    GRZ_LOCK="${lock}"
    # pretend we are pid 222 releasing; lock owned by 111
    grz_install_lock_release
    test -d "${lock}" && echo STILL || echo GONE
  `], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.home } });
  assert.match(rel.stdout, /STILL/);
  assert.equal(readFileSync(join(lock, 'pid'), 'utf8').trim(), '111');
});

test('R2: restart-serve holds the install lock; a held lock refuses restart; two concurrent restarts: one wins', { skip: !hasBash }, () => {
  const f = realTree(); assert.equal(run(f).code, 0);
  const restart = join(f.dst, 'scripts/note9-restart-serve.sh');
  const commonSrc = readFileSync(join(SCRIPTS, 'note9-common.sh'), 'utf8');
  const restartSrc = readFileSync(join(SCRIPTS, 'note9-restart-serve.sh'), 'utf8');
  assert.match(restartSrc, /grz_install_lock_acquire/);
  assert.match(restartSrc, /grz_install_lock_release/);
  assert.match(commonSrc, /grz_install_lock_acquire/);
  // Live lock blocks restart
  const lock = join(f.home, '.grz-install.lock'); mkdirSync(lock); writeFileSync(join(lock, 'pid'), String(process.pid));
  let r = spawnSync('bash', [restart], { encoding: 'utf8', env: envFor(f) });
  assert.notEqual(r.status, 0); assert.match(r.stderr + r.stdout, /holds .*\.grz-install\.lock; refusing|install lock refused/);
  // Free lock, race two restarts
  writeFileSync(join(lock, 'pid'), '999999999');
  const out1 = join(f.root, 'r1.out'); const out2 = join(f.root, 'r2.out');
  const raced = spawnSync('bash', ['-c', `
    unset PREFIX
    bash "${restart}" >"${out1}" 2>&1 & p1=$!
    bash "${restart}" >"${out2}" 2>&1 & p2=$!
    wait $p1; e1=$?
    wait $p2; e2=$?
    echo "E1=$e1 E2=$e2"
  `], { encoding: 'utf8', env: envFor(f) });
  assert.equal(raced.status, 0, raced.stdout + raced.stderr);
  const m = /E1=(\d+) E2=(\d+)/.exec(raced.stdout);
  assert.ok(m, raced.stdout);
  const codes = [Number(m[1]), Number(m[2])].sort();
  assert.ok(codes[0] === 0 && codes[1] !== 0, `expected one win one refuse, got ${m[0]}; out1=${readFileSync(out1,'utf8').slice(-500)} out2=${readFileSync(out2,'utf8').slice(-500)}`);
  assert.equal(existsSync(lock), false);
});

const FLOCK = spawnSync('bash', ['-c', 'command -v flock'], { encoding: 'utf8' }).stdout.trim();
function flockPrefix(f) { const p = join(f.root, 'prefix'); mkdirSync(join(p, 'bin'), { recursive: true }); symlinkSync(FLOCK, join(p, 'bin', 'flock')); return p; }
test('SD-33: with $PREFIX/bin/flock, a held flock refuses; free flock clears a dead-pid mkdir lock', { skip: !hasBash || !FLOCK }, () => {
  const f = fixture(); mkdirSync(f.home, { recursive: true }); const PREFIX = flockPrefix(f);
  const lockf = join(f.home, '.grz-install.flock');
  const held = spawnSync('bash', ['-c', `exec 8>>"${lockf}"; "${FLOCK}" 8; bash "${SCRIPT}" "${f.stage}" "${f.tsrc}"`], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: f.home, GRZ_MANIFEST_SHA256: f.manSha, PREFIX } });
  assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /holds .*\.grz-install\.flock \(flock\); refusing/);
  const lock = join(f.home, '.grz-install.lock'); mkdirSync(lock); writeFileSync(join(lock, 'pid'), '999999999');
  let r = run(f, { PREFIX }); assert.equal(r.code, 0, r.out); assert.match(r.out, /removing stale .*\.grz-install\.lock \(flock held/);
  assert.equal(existsSync(lock), false);
  mkdirSync(lock); writeFileSync(join(lock, 'pid'), String(process.pid));
  r = run(f, { PREFIX }); assert.notEqual(r.code, 0); assert.match(r.out, /another install \(pid \d+\) holds/);
});
