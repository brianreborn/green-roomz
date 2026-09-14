# Security-monitor requirements audit (xhigh, 2026-08-28 PT)

Canonical spec: `docs/security-monitor-requirements.md`

## Executive

Coherent PQ-style intent. Strange: several MUSTs cannot all be true on qodesh (Athlon 1+1) and stock Note 9.

## Blockers

- **F1** 3-replica majority vs qodesh 1+1. Do not freeze REPLICAS=3. Quorum at n=1 unanswered.
- **F2** Three vote domains (local replicas, live peers, local-wipe-must-not-wait-on-WAN). Do not freeze one Vote{n=3}.
- **F3** Copy-only vs mapped pinned host memory. GPU path: copy-engine private slot or host memcpy. Monitor↔monitor copy-only.
- **F4** Highest-grade default secure_reboot vs Note 9 no AID_ROOT. Missing verbs reject, never no-op success.
- **F5** Respond MUST live outside 8080; 8080 is the only process. v1: lockdown/reboot/secure_reboot uncallable stubs.
- **F6** Same graph for machine and ifX. Need verb × target matrix. lockdown(ifX) / secure_reboot(eth0) must not type-check.
- **F7** Android “same envelope” vs almost none of the call table. Freeze fields + capability mask; missing bit = reject.

## Should-fix before API freeze

F8 grade ≠ verb. F9 freeze/halt skip vote. F10 admin map-edit + grade = solo wipe. F11 8080 stamps identity. F12 logger fail-open can starve 1+1. F13 ticket string vs u64 {hi,lo}. F14 two queues (hot vs upcall). F15 encrypt-volumes has no call. F16 POSIX identity on Win/Android. F17 reject vs vote ticket space. F18 policy not in floor. F19 NIC DMA/reset is kernel. F20 first-node enroll / clone partition. F21 8600 one copy engine vs mailbox copies. F22 mid-reset not a state. F23 stale votes on reconnect. F24 fat-payload hash algo. F25 waitable is not int fd.

## Freeze now

Envelope fields; seq as logical 64-bit with {hi,lo} on sm_1.1; push non-blocking; broadcast drain; post/wait/reply; reject kind; state names; call-table names as symbols; grade as own type; optional rights mask; logger ≠ hot ring; GPU MUST NOT list; gate begin/end do not wait on vote; 32-bit lock-free ring.

## Leave stub

Replica/quorum, GPU ring choice, respond owner process, per-OS verb matrix, identity struct, ticket representation, second upcall queue body, encrypt-volumes, halt recovery, map-edit vote, enroll of node 1, vote TTL, waitable handle type.

## sm_1.1 probe progress

`native/sm11-monitor` proved copy + FNV on the 8600 GT (CUDA 6.5 / sm_11). Build is **Win32** on this VS2013 box. Not wired to JS yet — see `docs/fleet-targets.md` ship commitment and issue #13.
