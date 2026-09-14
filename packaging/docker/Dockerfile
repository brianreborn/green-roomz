# Green-Roomz try image (CPU). Open source; users can pull and chat on :8080.
# Build: docker build -f packaging/docker/Dockerfile -t green-roomz:try .
FROM node:22-bookworm-slim

ARG LLAMA_TAG=b10702
# Linux CPU builds are tar.gz (Windows uses zip). ?download=true avoids HF Xet HTML/401.
ARG TINY_URL=https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf?download=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gzip libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/green-roomz
COPY . .

RUN mkdir -p /opt/green-roomz/runtime /opt/green-roomz/models /opt/green-roomz/data \
  && curl -fsSL --retry 3 --retry-all-errors -o /tmp/llama.tar.gz \
      "https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz" \
  && mkdir -p /tmp/llama \
  && tar -xzf /tmp/llama.tar.gz -C /tmp/llama \
  && LLAMA_BIN="$(find /tmp/llama -type f -name llama-server | head -n 1)" \
  && test -n "$LLAMA_BIN" \
  && find "$(dirname "$LLAMA_BIN")" -maxdepth 1 -type f \( -name 'llama-server' -o -name '*.so*' \) \
       -exec cp -a {} /opt/green-roomz/runtime/ \; \
  && chmod +x /opt/green-roomz/runtime/llama-server \
  && rm -rf /tmp/llama /tmp/llama.tar.gz \
  && curl -fL --http1.1 --retry 5 --retry-delay 2 --retry-all-errors \
      -A "Mozilla/5.0 (compatible; green-roomz-docker)" \
      -o /opt/green-roomz/models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf \
      "${TINY_URL}" \
  && test "$(head -c 4 /opt/green-roomz/models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf)" = "GGUF"

ENV GRZ_ROOT=/opt/green-roomz \
    GRZ_LLAMA=/opt/green-roomz/runtime/llama-server \
    LD_LIBRARY_PATH=/opt/green-roomz/runtime \
    GREEN_ROOMZ_ALLOW_PUBLIC=1 \
    GREEN_ROOMZ_API_KEY=try-local \
    NODE_ENV=production

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["node", "bin/green-roomz.mjs", "serve", "--manifest", "config/agents.linux-try.json", "--host", "0.0.0.0", "--port", "8080"]
