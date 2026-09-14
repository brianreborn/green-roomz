# Green-Roomz try image (CPU). Open source; users can pull and chat on :8080.
# Build: docker build -f packaging/docker/Dockerfile -t green-roomz:try .
FROM node:22-bookworm-slim

ARG LLAMA_TAG=b10702
ARG TINY_URL=https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/green-roomz
COPY . .

RUN mkdir -p /opt/green-roomz/runtime /opt/green-roomz/models /opt/green-roomz/data \
  && curl -fsSL -o /tmp/llama.zip \
      "https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/llama-${LLAMA_TAG}-bin-ubuntu-x64.zip" \
  && unzip -q /tmp/llama.zip -d /tmp/llama \
  && find /tmp/llama -type f -name 'llama-server' -exec cp {} /opt/green-roomz/runtime/llama-server \; \
  && chmod +x /opt/green-roomz/runtime/llama-server \
  && rm -rf /tmp/llama /tmp/llama.zip \
  && curl -fL --retry 3 -o /opt/green-roomz/models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf "${TINY_URL}"

ENV GRZ_ROOT=/opt/green-roomz \
    GRZ_LLAMA=/opt/green-roomz/runtime/llama-server \
    GREEN_ROOMZ_ALLOW_PUBLIC=1 \
    GREEN_ROOMZ_API_KEY=try-local \
    NODE_ENV=production

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["node", "bin/green-roomz.mjs", "serve", "--manifest", "config/agents.linux-try.json", "--host", "0.0.0.0", "--port", "8080"]
