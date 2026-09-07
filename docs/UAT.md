# UAT and automated e2e

Both are gates. Domain `node --test` in `test/` is not enough to ship.

| Gate | What it is | Command | When it may skip |
|---|---|---|---|
| **UAT** | Operator path against a **running** `:8080` the way a tester opens it | `node scripts/uat.mjs` | Never skip if you claim serve works. Fail if the gateway is down. |
| **Automated e2e** | Harness boots its **own** llama + gateway on throwaway ports | `GRZ_E2E=1 npm run test:e2e` | Skip only when `GRZ_E2E` unset (CI without GGUF). Not a substitute for UAT. |
| Domain tests | Unit/protocol in `test/*.test.mjs` | `npm test` | Never a ship bar by themselves. |

## UAT (live operator)

Requires `green-roomz serve` on `http://127.0.0.1:8080` (HTTP, IPv4). Bounce serve after pulling `main`.

```powershell
node scripts/uat.mjs
# or: npm run uat
```

Checks: `GET /` HTML (not JSON 404), `/health`, `/v1/models`, a real chat completion, `/vision` without an image is 400, session follow-up, **https:// to :8080 fails** (no TLS — Firefox HTTPS-First).

Do not open `https://localhost:8080` in Firefox as the UAT. Use `http://127.0.0.1:8080/`.

Optional longer live probes (still UAT, not domain tests):

```powershell
npm run verify
npm run eval:e2e:live
```

## Automated e2e (isolated)

```powershell
$env:GRZ_E2E=1
# optional: $env:GRZ_E2E_LLAMA, $env:GRZ_E2E_MODEL
npm run test:e2e
```

Needs llama-server + a small GGUF on disk (`e2e/harness.mjs`). Protocol/stability strict; 0.5B quality is lenient.

## Priority

1. UAT against the process testers will actually hit.
2. Automated e2e with real HTTP and real tokens.
3. Domain tests for regressions.

A change that only has domain tests is not done.
