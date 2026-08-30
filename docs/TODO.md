# TODO / loose ends

Rolled up 2026-08-29. Grouped by area. `[ ]` = open, `[~]` = partially landed,
`[!]` = needs an external patch (llama.cpp / ggml), `[?]` = needs a decision from Brian.

## Agent memory system (the "human memory" — `.claude/.../memory/*.md`)

The persistence + recall plumbing is in Claude Code; everything else is prose the
model interprets. Guarantees today are **procedural, not transactional**.

- [ ] **Capture triggers ("seizure").** No explicit rule for *when* a turn should
      produce a memory — it is my judgement each turn. Write a short checklist
      into `~/.claude/CLAUDE.md` (or project `CLAUDE.md`) so it is consistent:
      what counts as save-worthy, what is already-in-repo and must not be saved.
- [ ] **Dedup / write barrier.** Nothing enforces "one fact per file, no
      duplicates" but me reading `MEMORY.md` + `ls` before writing. No unique
      constraint, no lock. Two concurrent Claude sessions could double-write or
      drop a `MEMORY.md` line. Options: (a) a pre-write convention documented in
      CLAUDE.md, (b) a tiny `memory-lint` script that flags near-duplicate slugs
      / orphaned `[[links]]` / `MEMORY.md` drift.
- [ ] **`mlock` on the monitor model.** `docs/model-lifecycle.md` L100-102/L154
      says the security-monitor's in-memory state must never touch disk. Honoured
      today only by `resident` + non-evictable — no actual `mlock`/`mlockall`
      syscall. This is the one real "memory barrier" still owed.

## Stock system-prompt compilation

**Design intent (corrected 2026-08-30):** the memory-feedback-loop requirements
are not a subsystem to build. They are **prose to compile into the stock system
prompts** — requirements become text the model interprets, not code. And the
prose *is* the implementation: compiling the MFL fragment into a cognitive
agent's prompt and serving it is installing the memory feedback loop, not a
placeholder for one. Full write-up: `docs/stock-prompts.md`.

The compile step assembles the final prompt text from its parts:

```
policies/frames/agency.md               (code-switching + cognitive-not-security)
  + policies/frames/memory-feedback-loop.md   (the six MFL states — cognitive agents only)
  + policies/frames/confidence.md         (confidence = a probability weight)
  + policies/<KERNEL_BASENAME[alias]>     (the kernel, verbatim, innermost)
  ───────────────────────────────
  = build/prompts/<alias>.md  →  git commit  (the diff is the audit record)
  →  optional `prime`: feed it once, POST /slots/0?action=save → "default
     installation" KV checkpoint (deploy-time, not shipped — needs
     n_predict:1 + cache_prompt:true to stick; build-version-specific)
```

Done:

- [x] **MFL prose** — `policies/frames/memory-feedback-loop.md` (commit 9ad6d6b).
- [x] **Compile step** — `src/compile-prompt.mjs` + `green-roomz compile [--check]`
      → committed `build/prompts/` + `index.json` (commit 4de9056). Kernel-text
      guards extracted to `src/kernel-text.mjs` to break the import cycle.
- [x] **Frame selection** — cognitive agents (working-set reasoners) get the MFL
      frame: `general-text-speculator`, `qwenstral-code-speculator`. Transducers
      (vision/audio/image) get agency+confidence only. Nexus + critical kernels
      get kernel only.

Open:

- [ ] **Wire runtime** (commit 3b) — `injectSystemPolicy` / `withNexusPolicy`
      prefer `build/prompts/<alias>.md` when the SHA matches `index.json`, else
      fall back to `loadDeclaredKernel` (unchanged). A custom `system_policy`
      always wins over a committed default compile. The `kernel-text.mjs`
      extraction (3a) is staged, not yet committed.
- [ ] **Wire `prime`** (commit 4) — `green-roomz prime`: start each cognitive
      agent with its compiled prompt, `n_predict:1` + `cache_prompt:true`,
      `snapshotModel(alias,'default')`; descriptor records prompt SHA + llama
      build id. `serve` restores `default.bin` on cold start when both match.
- [ ] **Kernel wart** — `code-structured.md` / `vision-layout.md` / `audio-*` /
      `image-generation.md` open with a headingless `First line if this is NOT
      your job: HANDOFF …` preamble, which floats between `# Confidence` and the
      `# <alias>` heading in the compiled output. Clean fix: a `handoff` frame,
      preamble stripped from those four kernels (kernel edits + `KERNEL_BASENAME`
      review — its own commit).
- [ ] **Move fragment sources to green-agentz** — per Plate 2 / Plate 9 the
      frames + compile belong in the canonical tree, emitting `build/prompts/`
      into the green-roomz subtree. Lives in green-roomz for now.

### Scope-creep to walk back

- [?] `dreamcatcher-memory.mjs` (content-addressed CoW store, `hashAgentId`,
      branch refs, `weightMemory`, `enqueueEviction`) + its "Epigenetic Memory
      Kernel" REQUIREMENTS + the deferred key-registry / branch-locking /
      telemetry / associative-relevance list — **all of this is beyond what the
      stock-prompt compile needs.** A durable record store for *accumulated*
      memories is a separate, later decision. For now the MFL model is prompt
      prose. Decide: keep the store staged for later, or drop it.
- [ ] De-dupe: `green-brainz/memory/` vs `kernel-staging/memory/` are identical copies.
- [ ] `COGNITIVE_REQUIREMENTS.md` cited by REQUIREMENTS.md but not on disk — find or fold in.
- [ ] `autoDreamEnabled` ("background memory consolidation / auto-dream") appeared
      in a settings.json schema in session 5bf1e13c — locate that schema, decide
      if auto-dream (periodic re-prime / consolidation pass) is in scope.

### Reference

- `op/work/green-agentz/docs/memory-feedback-loop-requirements.md` — MFL-1..25.
  Provenance: signed Note Tweet "THE MEMORY FEEDBACK LOOP" (2024-02-06, note-tweet
  ID 1754979624184934400), local X archive `Downloads/twitter-2026-08-05.../data/`.
- `op/work/green-agentz/docs/architecture/memory-and-monitor.md` — mermaid diagrams.

## Model lifecycle — freeze / thaw / disk-backed

Analysis in `docs/model-lifecycle.md`. Built: SIGSTOP/SIGCONT, `coldStartChain`,
`waitForPortsFree`, disk KV checkpoints, `--no-warmup`.

- [!] **GPU-yield protocol** (`docs/model-lifecycle.md` §"GPU-yield protocol").
      `SIGUSR1` → `vkFreeMemory` weight+KV → confirm → SIGSTOP-able with VRAM
      released. Needs a bounded llama.cpp patch. dGPU hosts only (qodesh/note-dGPU).
- [!] **Managed VRAM build flag for ggml** — `cudaMallocManaged` /
      `VK_EXT_pageable_device_local_memory` so idle GPU models page to host RAM
      automatically. Build flag / small ggml patch. dGPU only; UMA APU needs none.
- [!] **tmpfs KV arena** — ggml CPU-backend allocator patch to `mmap` a pool file
      instead of `malloc`, on a ramdisk. Small win on top of the ~4 s hot
      restart; only worth it for <2 s restarts without SIGSTOP.
- [ ] **Persistent shader/pipeline cache dir** — set the driver cache env so
      ggml-vulkan does not recompile shaders every cold start. Env, not code — cheap, do it.
- [ ] **`--no-kv-offload` for evictable GPU models** — makes the big dynamic
      alloc pageable/suspendable while weights stay on GPU. Wire in `buildLaunch`
      for non-resident vulkan profiles.
- [ ] **Windows native suspend** — `this.suspendImpl` is a no-op stub on win32
      (we terminate instead). A `NtSuspendProcess` helper would let SHALOM freeze
      CPU models like POSIX.

## Council / variants

Built: variants expansion, `pinned`, council fan-out, 3 judges, scorecard,
`council-stats`. Ideas list also in `docs/council.md` §"Ideas not yet built".

- [ ] **`/council` slash command** + session default (`/council on qwen,internvl`).
      Currently council is `body.council` JSON only.
- [ ] **Download alt vision GGUFs** to actually populate the vision variants:
      InternVL2-2B, Qwen2-VL-2B, SmolVLM2-2.2B, moondream2. Only qwen2.5-vl-3b on
      disk today, so council-of-vision has nothing to fan out to.
- [ ] **`vision-fast` profile** in the manifest + ctx tuning (the finished form of
      vision-perf "A"; `image_max_tokens` / `mmproj_device` / `flash_attn` levers
      are wired, the dedicated profile is not).
- [ ] **Cascade / escalate** — run the cheap variant alone; convene the council
      only when its `/confidence` is low or its JSON fails the schema.
- [ ] **Weighted vote** — weight each variant by its running scorecard agreement.
- [ ] **Cross-host council** — fan out to note9 + qodesh + shalom over the peer
      allowlist. Blocked on host bring-ups (#2-#5).
- [ ] **Judge = security-monitor** for policy-sensitive turns.
- [ ] **Disagreement-as-signal** — log split turns to a fine-tune / human-review queue.
- [ ] **Checkpoint the winner's KV** (`snapshotModel`) so the next similar request warm-starts from it.
- [ ] **Council over profiles** (same model, `vulkan-all` vs `cpu-4`) to catch a quant/offload bug.
- [ ] **N-of-M quorum** — return once M agree, cancel the rest.

## Issue #1 (treasury label scanner) remaining asks

- [ ] **`prime` mechanism** — see §"Stock system-prompt compilation" above; the
      scanner's "install" prompt is one input to that same compile+prime pipeline.
- [ ] **Launcher EADDRINUSE bounce** in *all* launchers + mirror child
      stdout/stderr into `gateway.log` (only some launchers retry the port today).
- [ ] **Live scanner `json_schema` round-trip test** in e2e.

## Fleet host bring-ups (GitHub issues #2-#5)

Issues + `host/<name>` branches exist; actual work does not. Each: push local
changes, cut a local checkout on the host, get `green-roomz serve` green, set the
host's `default_variant`. Reference japanglify / UMAssisted layout.

- [ ] **#2 note9** (SM-N960U, Android 10, no root, 5.7 GB, Termux). SELinux blocks
      exec from `/data/local/tmp` and `/sdcard` — runtime must live in `~/grz-runtime`.
- [ ] **#3 pixel8** (Tensor G3, KernelSU, 8 GB).
- [ ] **#4 qodesh** (Athlon II X2, 8600GT 224 MB, 16 GB DDR3, Win11). GPU too
      small for 0.5B Q4 — CPU nexus only, ~3 tok/s. 7B code stays `impractical`.
- [ ] **#5 godslove** (i7-620M, FreeBSD 15, 8 GB).

## Diagrams produced earlier — where they are

- **Green Constellation Reconciliation** (the repo-topology diagram): published
  artifact `https://claude.ai/code/artifact/37f98a8e-180a-46c1-8673-42d5a9562ab9`;
  local copy `.claude/projects/C--Users-brian/5480284e-.../tool-results/artifact-37f98a8e-1788039924-3fae.html`.
  Linked from memory `green-constellation`.
- **green-agentz architecture set** (mermaid, in `op/work/green-agentz/docs/architecture/`):
  `system-overview.md`, `runtime-request-flow.md`, `fleet-deployment.md`,
  `memory-and-monitor.md`.
- [ ] These are only in the Codex working tree + a one-off artifact. Fold the
      architecture diagrams into a repo that actually ships (green-agentz `main`
      or green-roomz `docs/`), and drop the artifact URL somewhere durable.
- [ ] The "high-effort diagram documentation process" originally asked for was
      never run to completion across *all* projects — only the reconciliation
      diagram + the agentz set exist.

## Repo hygiene

- [ ] **green-agentz subtree refresh** — `systems/green-roomz/` subtree is at
      commit 8668fad; green-roomz `main` has advanced ~15 commits since. Re-pull.
- [?] **Deployed manifest divergence** (see memory `deployed-gateway-manifest-divergence`).
      Live SHALOM gateway loads `C:\LocalAI\android-pack\grz-termux\config\agents.windows.json`
      (all agents `runtime: "logical"` → single `:8081` backend, vision `unavailable`),
      not the repo manifest. Decide: repoint the deployment at the repo manifest,
      or formally fork the deployed one. Gateway also observed crashing with
      `EADDRINUSE 127.0.0.1:8080`.
- [ ] **Fold `docs/known-bugs.md` "still open" items** here or close them — several
      (JSON C0/C1 stripping on stream tails, upstream header allowlist) may already be done.
