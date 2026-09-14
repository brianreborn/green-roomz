# qodesh Windows MVP smoke prep

**Machine:** qodesh (`19f2c19e-e100-49f0-8507-813d66727973`)  
**When:** 2026-09-06 ~08:14–08:23 AM PT  
**Tree:** `C:\Users\brian\Documents\green-roomz`  
**Constraints honored:** never GGUF on 8600 GT; no Afterburner; CPU llama only; prefer cmd.exe under Documents; no git push; no LocalAI vulkan as primary llama; live `:8080` not bounced.

---

## Summary

| Step | Result |
|------|--------|
| 1. Sync MVP scripts/config into Documents\green-roomz | **PASS** |
| 2. Retarget `agents.windows.json` llama_server → CPU b10702 | **PASS** (`GGML_VULKAN=0`) |
| 3. Fetch bartowski Qwen2.5-0.5B-Instruct-Q4_K_M.gguf | **PASS** — **397808192** bytes (exact) |
| 4. Leave live `:8080` alone; document next MVP start | **PASS** — PID **11484** still LISTENING |
| 5. simpleStreams / GPU | **SKIP** — prior PASS; no GPU re-run |

**Concrete status: DONE — ready for next bounce onto `config\agents.windows-mvp.json`.**

---

## 1) MVP bits on Documents\green-roomz

Copied from box `/workspace/green-roomz/...` (CopyFromBox) unless already present:

| Path | Bytes | Notes |
|------|------:|-------|
| `scripts\fetch-tiny-instruct.cmd` | 2121 | fail-closed tiny Instruct fetch |
| `scripts\chat-mvp.cmd` | 564 | console chat wrapper |
| `scripts\chat-mvp.ps1` | 6282 | multi-turn / stream / Ctrl-C |
| `config\agents.windows-mvp.json` | 10855 | CPU MVP manifest |
| `WINDOWS-MVP.md` | 2478 | present (synced) |

---

## 2) llama_server retarget (`config\agents.windows.json`)

**Verified exe:**  
`C:\Users\brian\Documents\green-roomz\runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe` exists.  
Size **9216** is the normal b10702 thin stub; companion `llama-server-impl.dll` ~8.87 MB in same folder (full CPU zip pack present).

| Field | Before | After (verified) |
|-------|--------|------------------|
| `runtimes.llama_server.command` | `C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-server.exe` | `C:\Users\brian\Documents\green-roomz\runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe` |
| `env.GGML_VULKAN` | `1` | `0` |
| `base_args` | included `--main-gpu 0` | `--host 127.0.0.1 --parallel 1 --prio -1 --split-mode none --flash-attn off --poll 0` |

**Backup:** `config\agents.windows.json.pre-cpu-retarget.bak` (10245 bytes).  
Also present: `runtime\llama-server.exe` (flat stub copy for portable `GRZ_LLAMA=%GRZ_ROOT%\runtime\llama-server.exe`).

Whisper/piper/sd paths in the same JSON still reference `C:\LocalAI\...` (non-chat; not MVP primary).

---

## 3) Tiny Instruct GGUF (fail closed)

| Item | Value |
|------|-------|
| URL | `https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` |
| Dest | `models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` |
| Size | **397808192** bytes (exact expected) |
| Method | `scripts\fetch-tiny-instruct.cmd` (~2m45s; exit 0) |
| Partial | none left under `models\` |

### Nexus for windows-mvp next start

`agents.windows-mvp.json` needs resident nexus at `models\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf`.  
Copied from `C:\LocalAI\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` → `models\` (**460616064** bytes). No network fetch.

`models\` now:

- `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` — 397,808,192  
- `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` — 460,616,064  

Free on C: ~2.45 GB after.

---

## 4) Live `:8080` — untouched

```
TCP 127.0.0.1:8080  LISTENING  PID 11484
```

Health (sampled): `status=degraded`, `product=Green-Roomz`, `policy=maximize` — still the pre-MVP live pack (LocalAI-oriented paths for some agents; nexus resident ready). **No bounce.**

Disk retarget of `agents.windows.json` does not change the running process until restart.

### Next start (when operator chooses to bounce)

From `C:\Users\brian\Documents\green-roomz` (cmd.exe), after stopping the current serve:

```bat
set GRZ_MANIFEST=%CD%\config\agents.windows-mvp.json
set GRZ_LLAMA=%CD%\runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe
node bin\green-roomz.mjs serve --manifest config\agents.windows-mvp.json --host 127.0.0.1 --port 8080
```

Or `start.cmd` if present (prefers `agents.windows-mvp.json` when that file exists).

Chat smoke after MVP serve is up:

```bat
scripts\chat-mvp.cmd general-text-speculator
```

Expect CPU profiles only (`--device none` / `--n-gpu-layers 0`). **Never** map GGUFs onto 8600 GT.

---

## 5) simpleStreams / GPU

**Skipped this pass.** Prior simpleStreams one-shot already **PASS**. 8600 GT remains display-only; MVP chat path is CPU llama b10702 only.

## VERIFIED (2026-09-06 ~09:07 AM PT)

Rechecked on qodesh after prep claim DONE:

| Check | Result |
|-------|--------|
| Instruct GGUF `models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | **397,808,192** bytes (exact) |
| Nexus GGUF `models\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | **460,616,064** bytes |
| CPU llama runtime `runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe` | present (9216 stub + impl.dll) |
| `agents.windows.json` llama_server | retargeted to Documents CPU b10702; `GGML_VULKAN=0` |
| `config\agents.windows-mvp.json` | present; preferred for serve |
| Live `:8080` (pre-parity bounce) | was PID 11484; later PF-bounced onto MVP |
| 8600 GT / Afterburner / git push | not used |

**Post-verify operator priority:** hybrid-chat parity battery required bounce onto MVP. See `qodesh-mvp-parity-battery.md`.

**Athlon 2-core fix applied on disk:** MVP llama profiles changed from `--threads 4/6` → **`--threads 1`** (profile ids `cpu-1` / `cpu-1b`) so nexus+specialist Σ≤`nproc` (2). Manifest copied to qodesh; **serve bounce to pick up threads=1 was blocked** when qodesh disconnected mid-operation — re-bounce when host is back.
