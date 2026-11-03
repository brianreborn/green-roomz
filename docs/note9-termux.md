# Note 9 Termux onboarding (2026-08-29, shalom USB)

No root. Do not `adb push` into Termux private dirs. Do not `su`.

## Hardware

| field | value |
|---|---|
| SKU | SM-N960U `crownqltesq` |
| serial | `27841130ae1c7ece` |
| SoC | SDM845 / Snapdragon 845, Adreno 630 |
| RAM | 5.7 GB (MemTotal ~5710492 kB; ~3.0 GB free under load) |
| OS | Android 10 / API 29 |
| Termux | `com.termux` uid `u0_a314`; Node **v26.4.0** |

## Measured 0.5B Q4_K_M (CPU, 4 threads)

| test | t/s |
|---|---|
| llama-cli interactive gen | 8.4 |
| llama-bench pp64 | **36.8** |
| llama-bench tg32 | **23.8** |

Pack on shalom: `C:\LocalAI\android-pack\arm64-v8a` (~219 MB). Model: `C:\LocalAI\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` (~439 MiB). ADB push ~28 MB/s.

## Live layout on device

| path | who | role |
|---|---|---|
| `/data/local/tmp/grz` | `shell` 777 | adb drop zone (bin/lib/models + scripts). **SELinux: Termux cannot execute here.** |
| `~/grz.<manifest-sha>/` | Termux (700) | one verified cut: `runtime/` (bin/lib/models), `tree/` (JS tree, `config/agents.note9.json`), `.verified` |
| `~/grz.current` | Termux | the only symlink: → `grz.<sha>`; flipped by `ln -s` tmp + `mv -T` after verify |
| `~/.green-roomz-state/` | Termux (700) | user state, never hashed or copied: `agents.note9.local.json` override (600), `logs/` (opt-in, 600), `ext-apps.status` |
| `/sdcard/Download/grz` | sdcard_rw | optional staged-tree drop only; **nothing is written here** (no logs, no pidfile) |

Gateway: Termux `node` `127.0.0.1:8080`. From shalom: `adb forward tcp:18080 tcp:8080` then `http://127.0.0.1:18080`.

Resident **tool-router-agent** `:8187` is the only GGUF on the phone. Other aliases stay `unavailable` (missing specialist files). Chat smoke 2026-08-29: HTTP 200 ~4.5 s via forward.

## Why `/data/local/tmp` failed

- `/sdcard` is `noexec` and `rw-rw----` until `termux-setup-storage`.
- `bash /sdcard/.../enable-ext.sh` → **Permission denied** (read).
- `[[ -x /data/local/tmp/grz/bin/run-llama-server.sh ]]` fails under Termux even when the file is `755`: **SELinux `untrusted_app` cannot execute `/data/local/tmp`**. Runtime is verified and installed into `$HOME/grz.<sha>/runtime`.
- Termux also cannot **write** `/data/local/tmp` (status files). Logs are **off by default**; `GRZ_LOG_OPT_IN=1` at setup sets `log_opt_in` in the override, and logs then go to `~/.green-roomz-state/logs/*.log` (600). Never `/sdcard`.

## ADB / Termux automation (do not race)

- `am startservice … RunCommandService` from `adb shell` → **Permission Denial** `com.termux.permission.RUN_COMMAND`.
- `am broadcast … RUN_COMMAND` returns 0 and does nothing.
- `input text` into Termux works if the **terminal_view is focused** and **CTRL extra-key is off**. Sticky CTRL turns `bash` into `ash`.
- Dump UI first: `uiautomator dump` and read `com.termux:id/terminal_view` `content-desc`.
- Type `ba` then `sh` then `%s~/grz-release/scripts/note9-termux-setup.sh` (after the tarball sha check below). Never toggle CTRL unless you mean Ctrl-C.

`allow-external-apps=true` was written to `~/.termux/termux.properties` (status now written to `~/.green-roomz-state/ext-apps.status`).

## Scripts in this repo

| file | use |
|---|---|
| `config/agents.note9.json` | Termux manifest (`${HOME}/grz.current/runtime/…`; runtime command = tree's runner) |
| `scripts/note9-termux-setup.sh` | pkg nodejs, verify + flip, write override, validate, serve |
| `scripts/note9-common.sh` | sourced: SDK gate, `$REALPATH`, resolve `grz.current`, override port/log_opt_in, serve start |
| `scripts/note9-refresh-src.sh` | new cut via the verified tree's verifier + flip (needs `GRZ_MANIFEST_SHA256`); then restart. Copies nothing into the tree |
| `scripts/note9-enable-external-apps.sh` | `allow-external-apps=true` |
| `scripts/note9-restart-serve.sh` | kill pidfile, serve from `grz.current` (no stored path) |
| `scripts/note9-run-llama-server.termux.sh` | release runner, run from the hashed tree |

Push the cut with `adb push` to `/data/local/tmp/grz/` (runtime in `bin/ lib/ models/`, JS tree in `green-roomz/`, `chmod 644`) push the release tarball too, then from a Termux prompt **check the tarball sha256 first**, extract it under `$HOME`, and run setup from there (see *Release tarball* below). Setup refuses to run from shared/adb-writable storage. All `scripts/note9-*.sh` use `#!/usr/bin/env bash` (works under Termux and NewTermux with termux-exec); always invoke them as `bash script.sh`. `note9-run-llama-server.termux.sh` runs `grz.current/runtime` under Termux and the `/data/local/tmp` path only as adb `shell` with `GRZ_ADB_DEBUG=1`. Setup options: `GRZ_PRUNE_APT_SOURCES=1` (persistent, needs Brian's per-host OK), `GRZ_PORT`, `GRZ_LOG_OPT_IN=1`. Android 9 (API 28)+ required: setup/runner refuse on SDK < 28, on empty/non-numeric `getprop`, or when `getprop` is missing on Android (`$TERMUX_VERSION` set or `uname -o` = `Android`; `$PREFIX` is not a signal); the check is skipped only on non-Android hosts.

## RAM admission

`src/memory.mjs`: headroom **2 GiB** if `os.totalmem() >= 8 GiB`, else **256 MiB**. Without that, Note 9 rejected cpu-4 (`estimate ~1.27 GiB + 2 GiB headroom > ~3.0 GiB free`).

## Next (not done)

- Adreno 630 OpenCL/Vulkan llama backend (CPU pack only today).
- Pixel 8 same pack; not pushed.
- Specialist GGUFs on phone (code/text/embed) — RAM-tight.
- qodesh still ping-timeout at last check (`192.168.1.40`).
- Do not Magisk/root unless a later task truly cannot copy into `$HOME`.

## Runtime and tree verification (mandatory)

`scripts/note9-termux-setup.sh` never executes the staged **runtime** (`bin/`, `lib/`, `models/`)
from `/data/local/tmp/grz`. Setup, the verifier and their sourced
helpers come from the release tarball (sha-checked by Brian, extracted under `$HOME`), never from
the staged tree. `npm-deps: none`: `package.json` has no runtime deps and no lockfile; setup never
runs npm, and setup, the verifier and the runner refuse any `node_modules` dir.
`scripts/note9-verify-runtime.sh` copies **only files listed** in the in-cut manifest
`config/note9-runtime.SHA256SUMS` into a temp dir, checks every sha256, then installs it as
`$HOME/grz.<sha>/{runtime,tree}` and flips `grz.current`. No `node_modules`
(npm-deps: none); the runner also refuses any unlisted `*.node`.

Setup aborts when:
- the manifest (taken only from the staged tree) is missing or empty (the shipped placeholder);
- `GRZ_MANIFEST_SHA256` is unset or differs from the manifest's sha256 (the actual hash is printed);
- any staged file is not listed, any copy fails (no symlink fallback), or any hash mismatches;
- `$HOME` (realpath) is on Android shared storage (one list, `config/shared-storage-prefixes.txt`:
  `/storage/ /sdcard /mnt/sdcard /mnt/user/ /mnt/media_rw/ /data/media/ /data/local/tmp`);
- another install holds `~/.grz-install.lock` (atomic mkdir; an empty pid counts as held; a dead
  pid's lock is renamed aside with `mv -T` before a fresh mkdir).

Re-running with the same, intact, already-current sha skips the copy and the flip. Startup
sweeps only real dirs `grz.<64hex>.old.<n>` / `grz.unverified.<t>.<p>.old.<n>` / `.grz-verify.XXXXXX`; after a flip, the kept
previous version is the one recorded in `~/.green-roomz-state/install-history` (never mtime).

Host override `~/.green-roomz-state/agents.note9.local.json`: ≤ 4 KB, no duplicate keys (counted after decoding, so `\u0070ort` = `port`), keys
`port` / `api_key_file` / `log_opt_in` only (accepted keys are logged at load). `api_key_file`
is realpath'd, must be a regular non-symlink file under realpath(`$HOME`), mode 600 or 400,
owned by the Termux uid, not on shared storage (allowlist first: realpath must be under
realpath(`$HOME`)/; deny list second). It is opened once with `O_NOFOLLOW`, checked with `fstat` on
that fd and read through it; the gateway uses it as its bearer key when
`GREEN_ROOMZ_API_KEY` is unset.

**Trust anchor.** `GRZ_MANIFEST_SHA256` is the sha256 of the manifest, given to the operator
out of band (e.g. read from the build host, not from the phone). No signing yet.

Build host:

    bash scripts/note9-gen-manifest.sh <stage_root> <stage_root>/green-roomz config/note9-runtime.SHA256SUMS
    #   refuses zero tree/ lines, a missing model line (--allow-no-model = DRYRUN header, dry runs
    #   only) and node_modules; prints: manifest ... sha256=<M>  bin=N lib=N model=N tree=N
    bash scripts/note9-pack-release.sh             # dist/grz-note9-release.tar.gz
    #   git archive of HEAD (refuses a dirty tree), gzip -n: setup, verifier, extract script,
    #   common + shared-storage helpers, prefix list, manifest. Prints tarball sha256=<T> and manifest sha256=<M>.

Publish **T and M together** (out of band). Nothing is uploaded or pushed by these scripts.

### Release tarball (Brian, on the phone, before running anything)

    sha256sum /data/local/tmp/grz/grz-note9-release.tar.gz     # must equal T; stop if not
    T=/data/local/tmp/grz/grz-note9-release.tar.gz; TAR=$PREFIX/bin/tar   # GNU tar (pkg install tar)
    $TAR --version | head -1 | grep -q 'GNU tar' || echo "STOP: not GNU tar (toybox refused)"
    $TAR -tvzf "$T"      # SD-31: LIST FIRST. Stop on any absolute path, any '..', or any line not
                         # starting with '-' (regular file) or 'd' (git archive's parent dirs).
    rm -rf ~/grz-release && (umask 077; mkdir -m 700 ~/grz-release) \
      && $TAR -xzf "$T" -C ~/grz-release --no-same-owner --no-same-permissions
    GRZ_MANIFEST_SHA256=<M> bash ~/grz-release/scripts/note9-termux-setup.sh

Later updates: `bash ~/grz-release/scripts/note9-extract-release.sh <tarball> <fresh dir>` does
the same checks (GNU `$PREFIX/bin/tar` only, list first, fresh 0700 folder, `--no-same-owner`).
Setup refuses a release folder containing anything but regular files and directories.

T covers every script that runs before verification; M anchors everything they copy.

**SD-29:** the verifier and the runner refuse a manifest with a `# DRYRUN` line or without a
`models/` line (no escape hatch; checked before the anchor).

**API key (always required, loopback included):** setup creates `~/.green-roomz-state/api.key`
(0600, 64 hex) if absent and sets `api_key_file` in the override. Setup/restart refuse to start
the gateway, and the runner refuses to start llama-server, without a valid key
(`api_key_file` or `GREEN_ROOMZ_API_KEY`). llama-server gets `--api-key-file` (never the key in
argv); the readiness probe sends `Authorization: Bearer`.

**Escape hatch:** `GRZ_ALLOW_UNVERIFIED_RUNTIME=1` skips verification with a loud warning.
Use only with Brian's per-host OK.

**Serve process:** setup/restart track serve in `$HOME/grz-serve.pid` (mode 600) and kill
only if `/proc/<pid>/cmdline` still matches `bin/green-roomz.mjs serve`. No `pkill -f`.
Source updates go through `note9-refresh-src.sh` (verify + flip, never an in-place copy); `note9-restart-serve.sh` only restarts, resolving `grz.current`.
