# Green-Roomz race pass 4 (post-P0 / RF4 cut)

Date: 2026-09-06 ~18:20 PT verify; **RF4 applied 2026-09-06 ~18:18 PT** on `/workspace/green-roomz`. Cite: integrate-refinement, platform-pass4. No git push. No `stop.sh`.

---

## P0 verify (earlier)

RF1–RF3, RF5–RF7, RF9, F22, messages array — landed. Live e2e had matching src; pidfile present.

---

## RF4 cut (landed)

| Residual | Fix |
|---|---|
| `stopRecord` returned on 3s timer after SIGKILL while `exitCode` still null | After race, if still alive → SIGKILL again and **await `exit`** (`process-manager.mjs` stopRecord). |
| `evictForNewSpecialist` ignored `waitForPortsFree === false` | Throw `UnavailableError` `code: port_busy` so incoming start does not bind-steal. |
| `waitForReady` returned on probe without re-checking child | After `probe.ready`, require `exitCode === null` or throw `… after health probe`. |

**Tests** (`test/process-manager.test.mjs`): three RF4 cases; suite **36/36 pass**.

Live `:8080`/`:8187` left alone (beta-0.5 bounce already done). Tree change is git working tree only until Researcher commits.

---

## Still out

Homoglyphs / API-key / reboot. PF1 stop.sh not run against live ports.
