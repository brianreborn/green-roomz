# DISPATCH-FIX-01 live bounce — CLOSED

**Date:** 2026-09-12  
**Bouncer:** Senior Developer  
**Host:** qodesh `:8080`

## Result

| model | status | note |
|-------|--------|------|
| code-agent | **400** | Unknown agent alias |
| general-text-agent | **400** | Unknown agent alias |
| image-generation-agent | **503** | agent_unavailable |
| auto | **200** | eff=tool-router-agent (not 400) |
| speech-synthesis-agent | **200** | cold (callable) → sticky nexus; policy-correct, not fallthrough |

## Notes

- Staged `from-box` was pre-NATIVE_CHAT and crashed serve; Senior Dev merged DISPATCH-FIX-01 into full probe routing → `src\routing.mjs` (+ updated backup).
- Boundary: BND-04 **closed**.
- No push.

## Next

Vision-first / prettify (DISPATCH #2) + BND-03 slash modality.

## GitHub

- PR: https://github.com/brianreborn/green-roomz/pull/12 (`fix/dispatch-01-explicit-model-pin`)
- Issue #11: OTHER-team wake packet
- Post-merge: sync live qodesh from tip — **do not** parallel-edit `routing.mjs`

## Hold (New Bot 2026-09-12)

- Hold `routing.mjs` edits — post-merge sync of PR #12 tip only.
- Drop one line on GitHub issue **#11** only after clean **live fuzz** fallthrough pass (unknown→400, unavailable→503). Curl gates alone do not trigger that comment yet.
