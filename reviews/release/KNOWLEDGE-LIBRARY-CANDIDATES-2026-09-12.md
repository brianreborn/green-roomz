# Knowledge library candidates — curated compressed set — 2026-09-12

**Audience:** operator Brian  
**Scope:** Offline security workstation **+** Note9 VM ship cells (all three OS lines: FreeBSD/pqfreebsd, Debian-class, HardenedBSD).  
**Philosophy:** Approve an **always-on extreme-compressed** corpus for airgap RAG / operator recall. **Policy 2026-09-12:** popular **official OS handbooks** and similar official platform docs are **APPROVED-FULL-COMPRESSED** (not extract-only) — purpose: accurately test for known/similar vulns and **harden platforms by default**. Complete unrelated manpage trees / magazine packs may stay on-demand.  
**Not an exploit dump.** Defensive admin knowledge only. No commercial Schneier/Knuth/Hofstadter book mirrors; Crypto-Gram + USENIX OA + DEF CON media OK.  
**Policy board:** `KNOWLEDGE-PACK-POLICY-2026-09-12.md` · archive `knowledge/os-handbooks-extreme.tar.zst`

**Related boards:**
- `OFFLINE-SECURITY-WORKSTATION-PLAN-2026-09-12.md` (§10 addendum)
- `GOAL-UPDATE-3OS-NOTE9VM-2026-09-12.md`
- `MODEL-PACK-INVENTORY-2026-09-12.md` (embed/rerank aliases)
- **`knowledge-approval-matrix.html`** — polished dark-theme operator approval screen (groups A–D)
- **`KNOWLEDGE-SCHNEIER-FREE-2026-09-12.md`** — Crypto-Gram APPROVED-FREE pack vs commercial EXCLUDE-FROM-MIRROR

**Hard rules:** cite real Archive.org item IDs/URLs only · no invented GGUF filenames · commercial/borrow-only IA items = pointer/reference, not offline mirror without explicit license OK.

---

## 1. Always-on core (compressed) — propose ≤15

Disk intent: **one extreme-compressed RAG corpus** (`zstd -19` / `xz -9e`). **OS handbooks = FULL official texts** (APPROVED-FULL-COMPRESSED). Kit-native ops cards remain compact. See `knowledge/os-handbooks/` + `MANIFEST-os-handbooks.md`.

| # | Title (always-on) | Why | Source / provenance | Compress shape |
|---|-------------------|-----|---------------------|----------------|
| 1 | **FreeBSD Handbook — FULL PDF** | Core BSD hardening vocabulary shared by FreeBSD/pqfreebsd **and** HardenedBSD baseline | Official: https://download.freebsd.org/ftp/doc/en/books/handbook/handbook_en.pdf · docs.freebsd.org · IA mirrors optional courier | **APPROVED-FULL-COMPRESSED** → `knowledge/os-handbooks/freebsd/handbook_en.pdf` |
| 2 | **OpenBSD FAQ + PF docs — FULL** | PF / secure-by-default mental model for workstation + VM guests | Official: https://www.openbsd.org/faq/ · https://ftp.eu.openbsd.org/pub/OpenBSD/doc/ | **APPROVED-FULL-COMPRESSED** → `knowledge/os-handbooks/openbsd/` |
| 3 | **Debian Administrator’s Handbook — FULL free edition** + Securing Debian Manual | Debian-class kit primary admin text (CC-BY-SA / GPL dual) | Official: https://debian-handbook.info/download/stable/debian-handbook.epub (stable PDF 404 → buster PDF) · https://www.debian.org/doc/manuals/securing-debian-manual/ | **APPROVED-FULL-COMPRESSED** → `knowledge/os-handbooks/debian/` |
| 4 | **HardenedBSD wiki export — FULL** | Third OS line — what differs from FreeBSD (hbsdcontrol, secadm, PaX/ASLR posture) | Official wiki (Handbook deprecated): https://hardenedbsd.org/content/hardenedbsd-handbook → wiki; GitHub mirror https://github.com/HardenedBSD/gitlab-wiki | **APPROVED-FULL-COMPRESSED** → `knowledge/os-handbooks/hardenedbsd/` |
| 5 | **Core Internet RFCs (compact set)** | Protocol ground truth for netadmin RAG; freely redistributable RFC series on IA | IA `rfcseries` collection — verified IDs: [`rfc791`](https://archive.org/details/rfc791), [`rfc793`](https://archive.org/details/rfc793), [`rfc1122`](https://archive.org/details/rfc1122), [`rfc1918`](https://archive.org/details/rfc1918), [`rfc1034`](https://archive.org/details/rfc1034), [`rfc1035`](https://archive.org/details/rfc1035), [`rfc4251`](https://archive.org/details/rfc4251), [`rfc4301`](https://archive.org/details/rfc4301), [`rfc5246`](https://archive.org/details/rfc5246), [`rfc8446`](https://archive.org/details/rfc8446); also [`rfc2001`](https://archive.org/details/rfc2001) | Plaintext only; optional one-page “when to open which RFC” index |
| 6 | **Project Gibralter — FreeBSD Security** | Small CC-BY-SA FreeBSD security pamphlet; good always-on density | [`project-gibralter`](https://archive.org/details/project-gibralter) (CC-BY-SA 4.0, unrestricted) | Keep whole item if small; else TOC+security sections |
| 7 | **FreeBSD Compact Guide** | Fast orientation for Note9 VM / mid-tier hosts | [`FreeBSD.Compact.Guide`](https://archive.org/details/FreeBSD.Compact.Guide) (CC-BY-SA 4.0) | Whole guide if compact; else “day-1 admin” pages |
| 8 | **Green-Roomz offline ops card** | Kit-native: bind rules, monitor reject stubs, peer allowlist, fetch-models build-time only | In-tree docs already on release path (`docs/deployment.md`, security-monitor docs, `MODEL-PACK-INVENTORY`) | Condensed markdown ≤ few dozen KB; **always ship with image** |
| 9 | **Fleet / Note9 VM ops card** | Phone Termux client vs Note9 **VM** ship cell; USB+adb-from-qodesh first connect | `docs/note9-termux.md`, `GOAL-UPDATE-3OS-NOTE9VM`, note9 readiness boards | One card: T0 router-only on phone; VM guest matrix cells; no ListMachines to note9 |
| 10 | **Package-audit & harden checklist (3 OS)** | First-boot offline audit recipe names without full man trees | `pkg audit` / HardenedBSD equivalent · Debian `debsecan`/`apt` audit class (kit-add) | Operator checklist + command cheat; **not** full manpages |
| 11 | **Defensive capture cheat (observe-only)** | tcpdump/wireshark-class vocabulary for airgap kit | Handbook network + OS man summaries (on-demand full mans) | Flags/filters cheat only; no offensive punch scripts |
| 12 | **UNIXBooksAndDocs — curated subset index** | Already hosts `FBSD-handbook*` + classic UNIX docs under CC-BY-ND 4.0 collection license | [`UNIXBooksAndDocs`](https://archive.org/details/UNIXBooksAndDocs) | Index + **FBSD handbook extract only** for always-on; leave Tanenbaum/etc. for legal review (may be third-party copyright despite collection upload) |
| 13 | **Crypto-Gram entire-issue pack (Schneier)** | Living security commentary; official reprint grant for **entire issues** | Official: https://www.schneier.com/crypto-gram/ · pack `/workspace/knowledge/schneier-crypto-gram/` · tarball `schneier-crypto-gram.tar.gz` | **APPROVED-FREE** starter: 72 complete issues (recent 12 months + 2000/2005/2010/2015/2020). HTML+md. More via `fetch-more.sh` (schneier.com only). **No book text.** |

**Count:** 13 proposed always-on items (within 8–15). Operator may cut to ~8 by dropping #6/#7 if #1+#2+#4 suffice for BSD lines. **#13 Crypto-Gram is APPROVED-FREE** (entire-issue reprint) and should stay even if the OS-doc set is trimmed.

**Official preference:** FreeBSD Handbook — prefer `https://download.freebsd.org/doc/en/books/handbook/handbook_en.pdf` (or current docs.freebsd.org tree) over IA mirrors when fetching extracts.

**Approval UI:** open `knowledge-approval-matrix.html` for the full A–D matrix (FREE / BORROW / OWN / OPS / DEFER pills).

**Explicitly not always-on:** unrelated bulk manpage dumps beyond curated man-pages tarball · complete release-note archives · commercial TCP/IP books · bulk `freebsdjournal` magazine pack · Schneier/Knuth/Hofstadter commercial books.

**Now always-on (policy change):** entire FreeBSD/Debian/OpenBSD/HardenedBSD official handbooks+FAQ + Linux official security docs — extreme-compressed.

---

## 2. On-demand catalog (pointers only)

Fetch when gapped-but-online / USB courier; do **not** pre-seed the always-on volume.

| Pointer | Role | Where |
|---------|------|-------|
| Full FreeBSD Handbook (current release) | Whole-platform admin — **now in always-on extreme pack** | https://docs.freebsd.org/en/books/handbook/ · `knowledge/os-handbooks/freebsd/` |
| FreeBSD Documentation Archive (per-release) | Historical / pin to installed release | https://docs-archive.freebsd.org/ |
| IA FreeBSD Handbook mirrors | Offline courier if docs.freebsd.org unreachable | https://archive.org/details/freebsd_handbook · https://archive.org/details/free-bsd-handbook-en |
| FreeBSD Porter’s Handbook | Ports/pkg maintainer track | docs.freebsd.org porters-handbook (Wayback also exists; prefer live) |
| Debian Administrator’s Handbook (full ebook) | Full Debian-class depth — **now in always-on extreme pack** | https://debian-handbook.info/get/ · `knowledge/os-handbooks/debian/` |
| IA Debian handbook (ES) | Language/courier fallback | https://archive.org/details/debian-handbook.es · https://archive.org/details/el-libro-del-administrador-de-debian |
| HardenedBSD wiki (full) | Live delta docs — **snapshot in always-on extreme pack** | git.hardenedbsd.org wiki / GitHub mirror `HardenedBSD/gitlab-wiki` · `knowledge/os-handbooks/hardenedbsd/` |
| Per-OS manpages / release notes | Platform truth for installed SKU | `man` / `pkg` / `apt` / release ERRATA — **on-demand per base** |
| FreeBSD Journal pack | Optional depth articles | https://archive.org/details/freebsdjournal (CC-BY-ND 4.0) — large; pull articles by need |
| RFC series (beyond core set) | Extra protocols | https://archive.org/details/rfcseries (collection) |
| Borrow-only commercial classics (reference, **not** mirror) | Historical TCP/IP admin reading | See §4 restricted list — Controlled Digital Lending / purchase; **no bulk offline copy** without rights |

---

## 3. Netadmin model options — recommend

### Options

| Approach | Role alias (proposed) | GGUF / artifact | Pros | Cons |
|----------|----------------------|-----------------|------|------|
| **A. RAG over this library** | **`netadmin-rag`** | Reuse existing **`semantic-embedding-agent`** + **`retrieval-rerank-agent`** from MODEL-PACK (nomic/bge **or** qwen3 embed/rerank lineages — operator pick). No new specialist weights required. | Fits airgap; answers grounded in approved texts; small always-on disk; aligns 3 OS + Note9 VM with one corpus | Needs corpus build + chunking; quality = library quality |
| **B. Specialist netadmin LLM** | **`netadmin-chat`** (optional) | **GGUF filename: TBD** — do not invent. No tip `agents.*.json` currently names a netadmin specialist. | Fluent synthesis / rewrite | Extra RAM/disk; hallucination risk offline; duplicates general-text role |
| **C. Hybrid** | `netadmin-rag` primary + optional `netadmin-chat` | Embed/rerank known; chat GGUF TBD if operator later pins a coder/instruct mid model already in pack | Best of both when RAM allows on workstation tier | Complexity; Note9 **phone** still T0-only — hybrid lives on workstation / Note9 **VM** host, not phone resident |

### Recommendation

**Approve A (RAG) as always-on netadmin path** under role alias **`netadmin-rag`**.  
Wire retrieval to the §1 compressed corpus; answer via existing **tool-router** / **general-text** already in the offline pack.  

**Defer B** until operator pins a real GGUF name/hash from an existing pack tier (e.g. reuse `qwen2.5-coder-*` or `Qwen3-4B-*` already inventoried — still **no new invented filename**). If pinned later, alias **`netadmin-chat`** with GGUF **TBD → measured**.  

**Note9 phone:** no netadmin specialist resident (T0 tool-router only). **Note9 VM** may host `netadmin-rag` when guest RAM allows (mid tier).

---

---

## 4. Classics matrix (rights-aware)

Operator screen twin: [`knowledge-approval-matrix.html`](./knowledge-approval-matrix.html) · Group **B**.  
Commercial / Controlled Digital Lending items are **cite or OWN-path only** — **EXCLUDE-FROM-MIRROR** (never bulk-mirrored into the airgap image). Schneier **Crypto-Gram** is **APPROVED-FREE** as an entire-issue pack (official reprint grant). Schneier/Knuth/Hofstadter/Stevens **books** stay cite/OWN only.

| ID | Work | Author / Source | Rights | Proposed action | Default |
|----|------|-----------------|--------|-----------------|---------|
| B1 | **Applied Cryptography** | Schneier · [`appliedcryptogra0000schn`](https://archive.org/details/appliedcryptogra0000schn) | **BORROW / OWN** | **EXCLUDE-FROM-MIRROR** · cite in bibliography; OWN-path mount at runtime if operator buys | **Cite-only · EXCLUDE-FROM-MIRROR** |
| B2 | **Secrets and Lies** | Schneier · [`secretsliesdigit0000schn_n2e3`](https://archive.org/details/secretsliesdigit0000schn_n2e3) | **BORROW / OWN** | **EXCLUDE-FROM-MIRROR** · CDL borrow or personal purchase — no airgap bulk copy | **Cite-only · EXCLUDE-FROM-MIRROR** |
| B3 | **Data and Goliath** | Schneier · [`datagoliathhidde0000schn`](https://archive.org/details/datagoliathhidde0000schn) | **BORROW / OWN** | **EXCLUDE-FROM-MIRROR** · pointer + OWN-path only | **Cite-only · EXCLUDE-FROM-MIRROR** |
| B4 | **Crypto-Gram entire-issue pack** | Schneier · [schneier.com/crypto-gram](https://www.schneier.com/crypto-gram/) · pack `/workspace/knowledge/schneier-crypto-gram/` | **FREE / APPROVED-FREE** (entire-issue reprint grant on each issue) | Always-on **complete issues** (starter 72: recent 12 months + 2000/2005/2010/2015/2020). HTML+md with attribution. More via `fetch-more.sh`. **No book text.** | **APPROVED-FREE** |
| B5 | **TAOCP vol set** | Knuth · [`artofcomputerpro0001knut_l0h13rdedition`](https://archive.org/details/artofcomputerpro0001knut_l0h13rdedition) | **BORROW / OWN** | **EXCLUDE-FROM-MIRROR** · cite only; no kit mirror | **Cite-only · EXCLUDE-FROM-MIRROR** |
| B6 | **Concrete Mathematics** | Knuth / Graham / Patashnik · [`B-001-002-135`](https://archive.org/details/B-001-002-135) | **BORROW / OWN · VERIFY** (often restricted) | **EXCLUDE-FROM-MIRROR** · default skip until rights verified; OWN if operator holds legal copy | **Skip (verify) · EXCLUDE-FROM-MIRROR** |
| B7 | **Gödel, Escher, Bach** | Hofstadter · [`gdelescherbach00hofs`](https://archive.org/details/gdelescherbach00hofs) · [`gdelescherbachan00hofs`](https://archive.org/details/gdelescherbachan00hofs) | **BORROW / OWN** | **EXCLUDE-FROM-MIRROR** · bibliography cite; do not mirror | **Cite-only · EXCLUDE-FROM-MIRROR** |
| B8 | **I Am a Strange Loop** | Hofstadter · [`iamstrangeloop0000hofs`](https://archive.org/details/iamstrangeloop0000hofs) | **BORROW / OWN** | **EXCLUDE-FROM-MIRROR** · BORROW/OWN path | **Cite-only · EXCLUDE-FROM-MIRROR** |
| B9 | **The Mind’s I** | Hofstadter & Dennett · [`mindsifantasiesr0000hofs`](https://archive.org/details/mindsifantasiesr0000hofs) | **BORROW / OWN** | **EXCLUDE-FROM-MIRROR** · bibliography only in kit | **Cite-only · EXCLUDE-FROM-MIRROR** |
| B10 | **TCP/IP Illustrated** | Stevens · [`tcpipillustrated00stev`](https://archive.org/details/tcpipillustrated00stev) (printdisabled) + other upload claiming PD Mark | **BORROW / OWN · VERIFY** | **EXCLUDE-FROM-MIRROR** · **FLAG: do not trust PD claim** — treat as commercial; cite/OWN only | **Cite-only · EXCLUDE-FROM-MIRROR** |

**Counts (Group B):** APPROVED-FREE pack = **1** (B4 Crypto-Gram entire issues) · BORROW/OWN **EXCLUDE-FROM-MIRROR** = **9** (B1–B3, B5–B10).

**Hard rule:** commercial scans are **EXCLUDE-FROM-MIRROR** — **NOT** bulk-mirrored into the airgap image. Operator may approve **OWN-path** (personal legal copies mounted at runtime) separately. Crypto-Gram is the sole Schneier **APPROVED-FREE** kit text.

---

## 5. Archive.org search hits (real links only)

Verified via Internet Archive advanced search / metadata API on **2026-09-12**. Prefer **unrestricted** items for offline courier.

### High-value unrestricted (candidates for extract or courier)

| Item ID | Title | URL | Notes |
|---------|-------|-----|-------|
| `freebsd_handbook` | FreeBSD Handbook (English & Russian Editions) — Official Documentation Archive | https://archive.org/details/freebsd_handbook | texts; unrestricted; includes `handbook_en.pdf` |
| `free-bsd-handbook-en` | FreeBSD Handbook in English | https://archive.org/details/free-bsd-handbook-en | opensource collection |
| `UNIXBooksAndDocs` | UNIX books and docs | https://archive.org/details/UNIXBooksAndDocs | CC-BY-ND 4.0 collection; contains `FBSD-handbook*` |
| `FreeBSD.Compact.Guide` | FreeBSD Compact Guide | https://archive.org/details/FreeBSD.Compact.Guide | CC-BY-SA 4.0 |
| `project-gibralter` | Project Gibralter - FreeBSD Security | https://archive.org/details/project-gibralter | CC-BY-SA 4.0 |
| `freebsdjournal` | Free BSD Journal | https://archive.org/details/freebsdjournal | CC-BY-ND 4.0; **on-demand** (large magazine pack) |
| `debian-handbook.es` | El manual del Administrador de Debian | https://archive.org/details/debian-handbook.es | CC-BY-SA 4.0; Spanish |
| `el-libro-del-administrador-de-debian` | El libro del administrador de Debian | https://archive.org/details/el-libro-del-administrador-de-debian | CC-BY-ND 4.0; Spanish |
| `rfc791` | Internet Protocol | https://archive.org/details/rfc791 | rfcseries |
| `rfc793` | Transmission Control Protocol | https://archive.org/details/rfc793 | rfcseries |
| `rfc1122` | Requirements for Internet Hosts - Communication Layers | https://archive.org/details/rfc1122 | rfcseries |
| `rfc1918` | Address Allocation for Private Internets | https://archive.org/details/rfc1918 | rfcseries |
| `rfc1034` | Domain names - concepts and facilities | https://archive.org/details/rfc1034 | rfcseries |
| `rfc1035` | Domain names - implementation and specification | https://archive.org/details/rfc1035 | rfcseries |
| `rfc4251` | The Secure Shell (SSH) Protocol Architecture | https://archive.org/details/rfc4251 | rfcseries |
| `rfc4301` | Security Architecture for the Internet Protocol | https://archive.org/details/rfc4301 | rfcseries |
| `rfc5246` | TLS Protocol Version 1.2 | https://archive.org/details/rfc5246 | rfcseries |
| `rfc8446` | TLS Protocol Version 1.3 | https://archive.org/details/rfc8446 | rfcseries |
| `rfc2001` | TCP Slow Start / Congestion Avoidance / Fast Retransmit | https://archive.org/details/rfc2001 | rfcseries |

### Present on IA but **access-restricted** (borrow) — do **not** bulk-mirror

| Item ID | Title | URL |
|---------|-------|-----|
| `tcpipnetworkadmi00hunt` | TCP/IP network administration (Hunt) | https://archive.org/details/tcpipnetworkadmi00hunt |
| `tcpipillustrated00stev` | TCP/IP illustrated (Stevens) | https://archive.org/details/tcpipillustrated00stev |
| `completefreebsdd0000lehe` | The complete FreeBSD (Lehey) | https://archive.org/details/completefreebsdd0000lehe |
| `openbsdpfpacketf0000jere` | The OpenBSD PF Packet Filter Book | https://archive.org/details/openbsdpfpacketf0000jere |
| `buildinginternet0000chap` / `buildinginternet00zwic` | Building Internet Firewalls | https://archive.org/details/buildinginternet0000chap · https://archive.org/details/buildinginternet00zwic |

### Search gaps / caution

- **HardenedBSD:** no IA `mediatype:texts` hit for `title:HardenedBSD` (2026-09-12). Use official wiki, not IA.
- **English Debian Handbook:** prefer debian-handbook.info / debian.org; IA hits found were **Spanish** titles under Hertzog/Mas.
- **Unrestricted uploads of commercial books** (e.g. some “TCP/IP Illustrated” community uploads) may still be **copyrighted** — exclude from always-on until operator legal OK; prefer RFC + official handbooks.

Wayback (not IA “details” items, but useful on-demand): historical FreeBSD Handbook security chapter trees, e.g. https://web.archive.org/web/20090328180722/www.freebsd.org/doc/en/books/handbook (security/jails/MAC/audit TOC visible).

---

## 6. Operator approval checklist

- [ ] Approve **always-on** set size (keep 13 / cut to ~8 / edit list; keep #13 Crypto-Gram)
- [x] Approve **FreeBSD Handbook FULL** (#1) as BSD-line core — APPROVED-FULL-COMPRESSED
- [x] Approve **OpenBSD FAQ/PF FULL** (#2) + **Debian Handbook FULL** (#3) — APPROVED-FULL-COMPRESSED
- [x] Approve **HardenedBSD wiki FULL export** (#4) as third-line core (no IA substitute)
- [ ] Approve **core RFC plaintext set** (#5) for netadmin RAG
- [ ] Include or defer **Project Gibralter** (#6) and **FreeBSD Compact Guide** (#7)
- [ ] Confirm kit-native cards (#8 Green-Roomz, #9 Note9 VM/fleet) ship on every image cell
- [x] Confirm OS handbooks always-on extreme-compressed; on-demand remains for journals / commercial / huge release-note dumps
- [ ] Approve **netadmin recommendation: RAG (`netadmin-rag`)** over new specialist GGUF
- [ ] Defer **`netadmin-chat` GGUF** until real filename/hash pinned (TBD — do not invent)
- [ ] Legal: **exclude** access-restricted / unclear-rights commercial scans from always-on courier
- [ ] Classics matrix (§4): **EXCLUDE-FROM-MIRROR** for Schneier books / Knuth / Hofstadter / Stevens — cite/OWN only
- [ ] Classics: approve **B4 / #13 Crypto-Gram entire-issue pack** as **APPROVED-FREE** (72 issues fetched 2026-09-12; reprint grant quoted in pack ATTRIBUTION.md)
- [ ] Classics: **B6 Concrete Mathematics** + **B10 Stevens** remain VERIFY — do not trust PD Mark uploads
- [ ] OWN-path: optional separate approval for personal legal copies mounted at runtime
- [ ] Target coverage explicit: **FreeBSD/pqfreebsd + Debian-class + HardenedBSD + Note9 VM** (phone Termux stays T0 client)
- [ ] Corpus build owner: this team vs other Researcher `09f2d365…` (downloads) — pick
- [ ] Embed/rerank lineage for RAG: fetch-models **nomic/bge** vs windows **qwen3** — reconcile with MODEL-PACK
- [ ] Disk budget cap for always-on corpus (suggest: **≤500 MB texts+index** before embeddings; embeddings TBD by measurement)

---

## Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | WebSearch + Archive.org API metadata; cross-link existing release boards |
| Not invented | GGUF filenames; SHAs; HardenedBSD IA items (none found) |
| Companion | GOAL-UPDATE-3OS-NOTE9VM; OFFLINE plan §10; **knowledge-approval-matrix.html** |
| Classics § | §4 rights-aware matrix (B1–B3/B5–B10 EXCLUDE-FROM-MIRROR; B4 APPROVED-FREE Crypto-Gram pack) |
| Schneier pack | `/workspace/knowledge/schneier-crypto-gram.tar.gz` · addendum `KNOWLEDGE-SCHNEIER-FREE-2026-09-12.md` |

---

## 7. USENIX + DEF CON broad seed (curated / RAG) — 2026-09-12 addendum

**Companion:** [`KNOWLEDGE-USENIX-DEFCON-2026-09-12.md`](./KNOWLEDGE-USENIX-DEFCON-2026-09-12.md) · fetch policy `/workspace/knowledge/FETCH-POLICY.md` · stubs `knowledge/scripts/fetch-usenix-seed.sh` · `knowledge/scripts/fetch-defcon-slides-seed.sh`.

**Ambiguity note:** Operator said **“cacert models”** — treat as **curated/RAG models** (`netadmin-rag` / `general security-rag`) unless a literal **CAcert** corpus appears. No CAcert pack in-tree as of this date.

### Rights

| Corpus | Rights | Always-on shape | On-demand |
|--------|--------|-----------------|-----------|
| USENIX proceedings | Open access; authors retain copyright; personal/offline mirror OK **with attribution** (cite USENIX + paper) | Compressed **seed** PDFs/HTML (eras below) | Full year proceedings trees |
| DEF CON official media | `media.defcon.org` + `defcon.org` torrents OK | **Slides / PDFs / whitepapers only** | Video / torrent packs (multi-GB) |
| Forbidden | Random mirrors · pirate books · unverified IA PD on commercial titles | — | — |

### Seed counts (named titles)

| Era | Count | Resolved URLs | TBD/partial |
|-----|------:|--------------:|------------:|
| Classic ≤2005 | 12 | 11 | 1 |
| Mid 2006–2015 | 12 | 10 | 2 |
| Modern 2016–2025+ | 13 | 13 | 0 |
| **Total** | **37** | **34** | **3** |

### Always-on vs bulk

- **Always-on:** the 37-title seed (papers + DEF CON slides/WPs) chunked into the shared knowledge store **with** Schneier Crypto-Gram.
- **Do not** bulk-collect full USENIX trees or DEF CON video in the image build — catalog + allowlisted curl stubs only this pass.
- **RAG:** same embed/rerank agents as §3 (`netadmin-rag` primary; optional `general security-rag` alias over union of handbook/RFC + USENIX/DEF CON + Crypto-Gram).

### Approval checklist (addendum)

- [ ] Approve USENIX compressed seed (FREE/official, attribute) — matrix **A13**
- [ ] Approve DEF CON **slides** seed (FREE/official); defer video — matrix **A14** · on-demand video **D7**
- [ ] Confirm curated/RAG reading of “cacert models”
- [ ] Fill 3 TBD/partial URLs on next online pass
- [ ] Run fetch stubs when gapped-but-online; verify allowlist in FETCH-POLICY.md


### OS handbook pack (fetched 2026-09-12)

| Tree | Contents | Status |
|------|----------|--------|
| `knowledge/os-handbooks/freebsd/` | `handbook_en.pdf` (official) | FULL |
| `knowledge/os-handbooks/debian/` | stable EPUB + buster PDF + Securing Debian Manual | FULL (stable PDF 404 documented) |
| `knowledge/os-handbooks/hardenedbsd/` | gitlab-wiki zip + extract | FULL |
| `knowledge/os-handbooks/openbsd/` | obsd-faq.txt, pf-faq.txt, FAQ HTML | FULL |
| `knowledge/os-handbooks/linux/` | kernel security HTML, admin-guide, man-pages-6.9, Ubuntu security | FULL relevant |
| `knowledge/os-handbooks/alpine/` | thin wiki/docs + POINTERS.md | THIN |
| `knowledge/os-handbooks-extreme.tar.zst` | `tar | zstd -19` of above | ~1.8x ratio (PDFs already compressed) |
| `knowledge/harden-default/CHECKLIST.md` | Defensive harden-by-default checklist | Stub |
| Policy update | 2026-09-12: OS handbooks APPROVED-FULL-COMPRESSED (zstd -19) |
