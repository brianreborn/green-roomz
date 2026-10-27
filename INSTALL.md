# Green-Roomz — install

**One happy path for Linux x86_64.** Do this first. Windows / Android / Docker are sidecars — not competing first steps.

Gateway: `http://127.0.0.1:8080`. Nexus: `:8187`.
Need **Node on PATH** (`package.json` engines `>=22`; **Node 20 works**). ~1.5 GB RAM free. Ports 8080 and 8187 free on this host.

## Single happy path

From a **git tip** or an **unzipped pack**:

```bash
cd green-roomz
chmod +x install.sh start.sh stop.sh smoke.sh runtime/llama-server
./install.sh          # detect-only doctor (no serve, no fetch)
./start.sh            # serve config/agents.cursor.json on 127.0.0.1:8080
curl -s http://127.0.0.1:8080/health
./smoke.sh            # optional one-shot chat ping
```

`./install.sh` runs `scripts/grz-doctor.sh`, chmods launchers, and prints the next action. It never starts the gateway and never downloads GGUFs.

`green-roomz validate` / `npm run validate` / `scripts/cursor-validate.sh` is **optional diagnostic** — not a gate before `./start.sh`. Start loads the manifest itself.

### Models

- **Full pack / this tip:** nexus `models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` should already be present; doctor reports `models_missing: (none)` when ready.
- **Slim pack:** no GGUF in the zip — drop the nexus 0.5B into `models/` before `./start.sh` (or re-run `./install.sh` until doctor says `next: ./start.sh`).
- Other modalities (vision / whisper / piper / sd / embed) may be missing; health can be **degraded** while chat still works. **Never load GGUFs on an 8600 GT** (display-only; manifests stay `--device none`).

Stop: `./stop.sh` or Ctrl-C in the serve terminal. Optional board: `./console.sh` (every 2s; `CONSOLE_ONCE=1 ./console.sh` once).

## Sidecars (not step 1)

| Path | When | Entry |
|------|------|--------|
| Windows | Win host, no admin, CPU only | [INSTALL-WINDOWS.md](INSTALL-WINDOWS.md) → `install-windows.cmd` / `start.cmd` |
| Android | adb device + Termux | `./deploy-android.sh` then `termux-start.sh` — [docs/note9-termux.md](docs/note9-termux.md) |
| Docker try | no local models / no pack | [packaging/README.md](packaging/README.md) — `docker pull …:try` |
| FreeBSD / macOS | pack ELF is Linux-only | install system `llama-server`, then `./start.sh` |

Platform diagram: [docs/diagrams/install-platforms.md](docs/diagrams/install-platforms.md). In-pack HTML help: `docs/help/index.html`.

## Health

```bash
curl -s http://127.0.0.1:8080/health
./smoke.sh
```

`POST /lockdown` and `POST /reboot` return 404 this beta (by design).
