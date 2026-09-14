# e2e-fresh gateway stream fix — disk sync only (2026-09-06 PT)

Synced `/workspace/green-roomz/src/gateway.mjs` (a6be0f9 resident_fallback SSE fix) into
`/workspace/e2e-fresh/green-roomz/src/gateway.mjs` **without** bouncing live serve.

- Live node PID at sync: 1585752 on :8080 (cwd e2e-fresh) — ESM module cache keeps **old**
  `stream:false` force until operator bounce.
- Backup: `src/gateway.mjs.pre-0.5-stream.bak`
- After bounce, live e2e will honor client `stream:true` on resident_fallback.

No stop.sh / no kill / no fuser against :8080/:8187.
