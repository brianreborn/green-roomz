# Try Green-Roomz (open image)

This is the **user-facing try artifact**: a CPU-only container image with the gateway, llama-server, and two small GGUFs (~0.5B). No NVIDIA driver, no 8600, no Windows.

## Docker (the image users pull)

Once GitHub Actions has published:

```bash
docker pull ghcr.io/brianreborn/green-roomz:try
docker run --rm -p 8080:8080 ghcr.io/brianreborn/green-roomz:try
```

Then:

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer try-local' \
  -d '{"messages":[{"role":"user","content":"Say hello in one sentence."}],"max_tokens":64}'
```

Default API key is **`try-local`** (`GREEN_ROOMZ_API_KEY`). Change it in production.

Build locally (needs ~2 GB download: llama.cpp zip + two GGUFs):

```bash
docker build -f packaging/docker/Dockerfile -t green-roomz:try .
```

Save as a tarball (a file you can copy without a registry):

```bash
docker save green-roomz:try | gzip > green-roomz-try.tar.gz
# other machine:
gzip -dc green-roomz-try.tar.gz | docker load
```

## Disk image (VM)

GitHub Actions (`.github/workflows/try-vm.yml`) builds **`green-roomz-vm-kit.tar.gz`**: Debian 12 genericcloud qcow2 + cloud-init seed ISO.

- Release: https://github.com/brianreborn/green-roomz/releases/tag/try-vm
- First boot pulls `ghcr.io/brianreborn/green-roomz:try` and serves **:8080**
- ssh `grz` / `greenroomz` — see [packaging/vm/README.md](vm/README.md)

qodesh cannot bake the kit (no QEMU); CI does.

## What is inside

| Piece | Role |
|---|---|
| Node 22 | `bin/green-roomz.mjs serve` on `:8080` |
| llama-server (ubuntu-x64) | backends on 8187 (nexus) and 8184 (Instruct) |
| `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | resident + generic chat (one file, CPU) |
| `config/agents.linux-try.json` | CPU mmap, `--device none` |

Licenses: Green-Roomz repo license + llama.cpp MIT + model cards on Hugging Face (Qwen).
