# Knowledge pack — USENIX + DEF CON seeds — 2026-09-12

**Audience:** operator Brian  
**Scope:** Broad security / systems / netadmin corpus for offline workstation + Note9 VM RAG (alongside Schneier Crypto-Gram pack).  
**Target roles:** `netadmin-rag` · `general security-rag` (curated retrieval — **not** a specialist GGUF).  
**Philosophy:** **Always-on compressed seed** (papers + slides PDFs / extracts) vs **on-demand bulk** (full proceedings trees, multi-GB video). Do **not** waste effort bulk-collecting everything in this pass.

## Naming note — “cacert models”

Operator phrasing **“cacert models”** is treated here as **curated / RAG models** (chunked knowledge store + embed/rerank), **unless** a literal **CAcert** (certificate-authority community) corpus appears later. No CAcert document set was found in-tree on 2026-09-12; if one is added, keep it as a separate allowlisted pack and do not conflate with this USENIX/DEF CON seed.

## Rights (hard)

| Source | Policy | Cite |
|--------|--------|------|
| **USENIX** | Open-access proceedings — free to read; authors retain copyright; OK to mirror for **personal/offline kit** with attribution | https://www.usenix.org/publications/proceedings · cite **USENIX + paper** on every chunk |
| **DEF CON** | Official `media.defcon.org` + `defcon.org` torrents — OK | Prefer **slides/PDFs/whitepapers** for always-on; **video = on-demand** (size) |
| **Forbidden** | Random mirrors · pirate book sites · unverified Internet Archive “PD” claims for commercial books | — |

Companion boards: `KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md` · `knowledge-approval-matrix.html` · `/workspace/knowledge/FETCH-POLICY.md` · Schneier pack under `/workspace/knowledge/schneier-crypto-gram/`.

---

## Always-on compressed seed vs on-demand bulk

| Tier | What | Disk intent | This pass |
|------|------|-------------|-----------|
| **Always-on seed** | 8–15 named papers/talks **per era** (PDF/HTML abstracts + slides). Chunk → RAG store | Target **≤300–500 MB** texts before embeddings (operator may cut) | **Catalog + fetch stubs only** — no multi-GB pull |
| **On-demand bulk** | Full USENIX proceedings trees by year · DEF CON video / torrent packs · full talk audio | USB courier / gapped-but-online | **Pointers only** — do not pre-seed image |
| **Never** | Pirate mirrors · unverified commercial book scans · exploit PoC dumps framed as “education” | — | Out of policy |

**Fetch stubs (allowlist curl only):**

- `/workspace/knowledge/scripts/fetch-usenix-seed.sh`
- `/workspace/knowledge/scripts/fetch-defcon-slides-seed.sh`

Destinations: `/workspace/knowledge/usenix-seed/` · `/workspace/knowledge/defcon-slides-seed/`.

---

## Seed catalog by era

Counts below are **seed titles** (named examples). URLs marked **resolved** were confirmed via WebSearch to `usenix.org` / `media.defcon.org` / `defcon.org` on 2026-09-12. **TBD** = title selected for value; landing/PDF path not resolved in this pass (stub will skip or operator fills).

### Classic (≤2005) — **12 seeds**

| # | Title | Venue / year | Why (workstation / netadmin / systems) | URL | Status |
|---|-------|--------------|----------------------------------------|-----|--------|
| C1 | A Secure Environment for Untrusted Helper Applications (Confining the Wily Hacker) | USENIX Security ’96 | Sandbox / confinement root of modern helpers | https://www.usenix.org/conference/6th-usenix-security-symposium/secure-environment-untrusted-helper-applications · PDF https://www.usenix.org/legacy/publications/library/proceedings/sec96/full_papers/goldberg/goldberg.pdf | resolved |
| C2 | StackGuard: Automatic Adaptive Detection and Prevention of Buffer-Overflow Attacks | USENIX Security ’98 | Stack canaries — still in every hardened OS story | https://www.usenix.org/conference/7th-usenix-security-symposium/stackguard-automatic-adaptive-detection-and-prevention | resolved |
| C3 | Detecting Stepping Stones | USENIX Security ’00 | Interactive attack path detection vocabulary | https://www.usenix.org/conference/9th-usenix-security-symposium/detecting-stepping-stones | resolved |
| C4 | Inferring Internet Denial-of-Service Activity | USENIX Security ’01 | Backscatter / network telescope mental model | https://www.usenix.org/conference/10th-usenix-security-symposium/inferring-internet-denial-service-activity · PDF https://www.usenix.org/legacy/publications/library/proceedings/sec01/moore/moore.pdf | resolved |
| C5 | FormatGuard: Automatic Protection From printf Format String Vulnerabilities | USENIX Security ’01 | Format-string class still appears in audits | https://www.usenix.org/conference/10th-usenix-security-symposium/presentation/formatguard-automatic-protection-printf-forma | resolved |
| C6 | StackGhost: Hardware Facilitated Stack Protection | USENIX Security ’01 | Hardware-assisted stack integrity (SPARC lineage) | https://www.usenix.org/conference/10th-usenix-security-symposium/stackghost-hardware-facilitated-stack-protection | resolved |
| C7 | PointGuard: Protecting Pointers from Buffer Overflow Vulnerabilities | USENIX Security ’03 | Pointer integrity / data-oriented attack framing | https://www.usenix.org/conference/12th-usenix-security-symposium/pointguard%E2%84%A2-protecting-pointers-buffer-overflow | resolved |
| C8 | Improving Host Security with System Call Policies (Systrace) | USENIX Security ’03 | Syscall policy confinement (OpenBSD/BSD admin DNA) | https://www.usenix.org/conference/12th-usenix-security-symposium/improving-host-security-system-call-policies | resolved |
| C9 | Preventing Privilege Escalation | USENIX Security ’03 | OpenSSH privilege separation — gold standard for daemons | https://www.usenix.org/conference/12th-usenix-security-symposium/preventing-privilege-escalation · PDF https://www.usenix.org/legacy/publications/library/proceedings/sec03/tech/full_papers/provos_et_al/provos_et_al.pdf | resolved |
| C10 | Black Ops of TCP/IP (Spliced NAT2NAT …) — Dan Kaminsky | DEF CON 10 | Packet-level NAT/firewall traversal literacy for defenders | https://defcon.org/images/defcon-10/dc-10-presentations/dc10-kaminsky-tcpip.pdf | resolved |
| C11 | Host-based Intrusion Prevention on Windows and UNIX — Rich Murphey | DEF CON 11 | HIPS vs IDS framing; FreeBSD demo notes | https://defcon.org/images/defcon-11/dc-11-presentations/dc-11-Murphey/dc-11-murphey.pdf | resolved |
| C12 | How To Use BSD To Setup A Firewall/Gateway | DEF CON 7 | Early BSD firewall/gateway operator talk | Archive index: https://defcon.org/html/links/dc-archives/dc-7-archive.html · **slides PDF TBD** (video on archive) | partial |

### Mid (2006–2015) — **12 seeds**

| # | Title | Venue / year | Why | URL | Status |
|---|-------|--------------|-----|-----|--------|
| M1 | Enhanced Operating System Security Through Efficient and Fine-grained Address Space Randomization | USENIX Security ’12 | Fine-grained ASLR inside the OS | https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/giuffrida | resolved |
| M2 | ZMap: Fast Internet-wide Scanning and Its Security Applications | USENIX Security ’13 | Internet-wide scan ethics + measurement for netadmins | https://www.usenix.org/system/files/conference/usenixsecurity13/sec13-paper_durumeric.pdf | resolved |
| M3 | An Internet-Wide View of Internet-Wide Scanning | USENIX Security ’14 | What scanners look like on your edge | https://www.usenix.org/system/files/conference/usenixsecurity14/sec14-paper-durumeric.pdf | resolved |
| M4 | ROP is Still Dangerous: Breaking Modern Defenses | USENIX Security ’14 | Why coarse CFI/ASLR stories fail — patching posture | https://www.usenix.org/system/files/conference/usenixsecurity14/sec14-paper-carlini.pdf | resolved |
| M5 | Stitching the Gadgets: On the Ineffectiveness of Coarse-Grained CFI | USENIX Security ’14 | EMET-era coarse CFI limits | https://www.usenix.org/system/files/conference/usenixsecurity14/sec14-paper-davi.pdf | resolved |
| M6 | Oxymoron: Making Fine-Grained Memory Randomization Practical by Allowing Code Sharing | USENIX Security ’14 | ASLR vs shared libraries tradeoff | https://www.usenix.org/system/files/conference/usenixsecurity14/sec14-paper-backes.pdf | resolved |
| M7 | RAPTOR: Routing Attacks on Privacy in Tor | USENIX Security ’15 | BGP/routing vs anonymity systems | https://www.usenix.org/system/files/conference/usenixsecurity15/sec15-paper-sun.pdf | resolved |
| M8 | Circuit Fingerprinting Attacks: Passive Deanonymization of Tor Hidden Services | USENIX Security ’15 | Traffic analysis threat model | https://www.usenix.org/system/files/conference/usenixsecurity15/sec15-paper-kwon.pdf | resolved |
| M9 | Catching Malware En Masse: DNS and IP Style (whitepaper) | DEF CON 22 | DNS/IP-scale malware observation | https://media.defcon.org/DEF%20CON%2022/DEF%20CON%2022%20presentations/DEF%20CON%2022%20-%20Mahjoub-Reuille-Toonk-Catching-Malware-En-Masse-DNS-IP-Style-WP.pdf | resolved |
| M10 | Paul Vixie — DNS / RRL whitepaper (DEF CON 22) | DEF CON 22 | DNS Response Rate Limiting for DDoS amenability | https://media.defcon.org/DEF%20CON%2022/DEF%20CON%2022%20presentations/DEF%20CON%2022%20-%20Paul-Vixie-WP.pdf | resolved |
| M11 | Network Application Firewalls: Exploits and Defense — Brad Woodberg | DEF CON 19 | NGFW limits for operators | Talk index (InfoconDB) · **slides on media.defcon.org TBD** | TBD |
| M12 | SoK / survey seed — coarse-vs-fine memory defenses (operator pick from USENIX Security ’14–’15 SoK track) | USENIX Security mid | Systems SoK for RAG overview chunks | **TBD** — pin one SoK PDF on next online pass | TBD |

### Modern (2016–2025+) — **13 seeds**

| # | Title | Venue / year | Why | URL | Status |
|---|-------|--------------|-----|-----|--------|
| N1 | What Cannot Be Read, Cannot Be Leveraged? Revisiting Assumptions of JIT-ROP Defenses | USENIX Security ’16 | JIT-ROP / XnR assumptions for browser stacks | https://www.usenix.org/system/files/conference/usenixsecurity16/sec16_paper_maisuradze.pdf | resolved |
| N2 | Foreshadow: Extracting the Keys to the Intel SGX Kingdom … | USENIX Security ’18 | Transient execution / SGX — patch & attestation posture | https://www.usenix.org/system/files/conference/usenixsecurity18/sec18-van_bulck.pdf | resolved |
| N3 | A Systematic Evaluation of Transient Execution Attacks and Defenses | USENIX Security ’19 | Taxonomy for Spectre-class mitigations | https://www.usenix.org/system/files/sec19-canella.pdf | resolved |
| N4 | Open to a fault: On the passive compromise of TLS keys via transient errors | USENIX Security ’22 | TLS key integrity / soft faults | https://www.usenix.org/system/files/sec22-sullivan.pdf | resolved |
| N5 | Timeless Timing Attacks and Preload Defenses in Tor’s DNS Cache | USENIX Security ’23 | Tor DNS cache timing — privacy ops | https://www.usenix.org/system/files/usenixsecurity23-dahlberg.pdf | resolved |
| N6 | Downfall: Exploiting Speculative Data Gathering | USENIX Security ’23 | Modern CPU side-channel class | https://www.usenix.org/system/files/usenixsecurity23-moghimi.pdf | resolved |
| N7 | ENG25519: Faster TLS 1.3 handshake using optimized X25519 and Ed25519 | USENIX Security ’24 | TLS 1.3 crypto performance / deployability | https://www.usenix.org/conference/usenixsecurity24/presentation/zhang-jipeng · PDF https://www.usenix.org/system/files/usenixsecurity24-zhang-jipeng.pdf | resolved |
| N8 | certmitm — automatic exploitation of TLS certificate validation vulnerabilities | DEF CON 31 | TLS validation failure modes (defense: pin & test harness awareness) | https://media.defcon.org/DEF%20CON%2031/DEF%20CON%2031%20presentations/Aapo%20Oksman%20-%20certmitm%20automatic%20exploitation%20of%20TLS%20certificate%20validation%20vulnerabilities.pdf | resolved |
| N9 | SSHamble: Unexpected Exposures in the Secure Shell | DEF CON 32 | SSH config/exposure hygiene for netadmins | https://media.defcon.org/DEF%20CON%2032/DEF%20CON%2032%20presentations/DEF%20CON%2032%20-%20HD%20Moore%20Rob%20King%20-%20Sshamble%20Unexpected%20Exposures%20in%20the%20Secure%20Shell.pdf | resolved |
| N10 | Shaking Out Shells with SSHamble — HD Moore | DEF CON 33 | Follow-on SSH exposure survey | https://media.defcon.org/DEF%20CON%2033/DEF%20CON%2033%20presentations/HD%20Moore%20-%20Shaking%20Out%20Shells%20with%20SSHamble.pdf | resolved |
| N11 | Firewall flameout — China’s multi-year campaign against perimeter defenses — Andrew Brandt | DEF CON 33 | Perimeter appliance persistence lessons | https://media.defcon.org/DEF%20CON%2033/DEF%20CON%2033%20presentations/Andrew%20Brandt%20-%20Firewall%20flameout%20Chinas%205%2B%20year%20campaign%20to%20penetrate%20perimeter%20network%20defenses.pdf | resolved |
| N12 | Harvest Now, Decrypt Later — Practical Attacks on Post-Quantum Cryptography Implementations | DEF CON 34 | PQC migration pitfalls for future TLS/SSH | https://media.defcon.org/DEF%20CON%2034/DEF%20CON%2034%20presentations/DEF%20CON%2034%20presentations/DEF%20CON%2034%20-%20Aleksandr%20Krasnov%20-%20Harvest%20Now,%20Decrypt%20Later%20Practical%20Attacks%20on%20Post-Quantum%20Cryptography%20Implementations%20-%20slides.pdf | resolved |
| N13 | Nothing but Net — Leveraging macOS Networking Frameworks to Heuristically Detect Malware — Patrick Wardle | DEF CON 31 | Host net telemetry for defensive detection | https://media.defcon.org/DEF%20CON%2031/DEF%20CON%2031%20presentations/Patrick%20Wardle%20-%20Nothing%20but%20Net%20Leveraging%20macOS's%20Networking%20Frameworks%20to%20Heuristically%20Detect%20Malware.pdf | resolved |

### Era counts (seed titles)

| Era | Seed count | Resolved (landing or PDF) | TBD / partial |
|-----|------------|---------------------------|---------------|
| Classic ≤2005 | **12** | 11 | 1 partial (C12 slides) |
| Mid 2006–2015 | **12** | 10 | 2 TBD (M11, M12) |
| Modern 2016–2025+ | **13** | 13 | 0 |
| **Total** | **37** | **34** | **3** |

---

## RAG wiring

Wire this seed into the same knowledge store used by **`netadmin-rag`** and a **`general security-rag`** alias (curated retrieval), **alongside** the Schneier Crypto-Gram pack already under `/workspace/knowledge/schneier-crypto-gram/`.

### Recommended layout

```
/workspace/knowledge/
  FETCH-POLICY.md
  scripts/fetch-usenix-seed.sh
  scripts/fetch-defcon-slides-seed.sh
  usenix-seed/          # always-on PDFs + sidecar .meta.json (cite USENIX+paper)
  defcon-slides-seed/   # always-on slides/WPs only (no video)
  schneier-crypto-gram/ # existing
  rag-store/            # (future) chunks + embeddings — not built this pass
```

### Chunking rules (for next corpus-build pass)

1. **Unit:** one paper/talk → one or more chunks (≤~800–1200 tokens preferred; keep abstract + conclusion intact when possible).
2. **Metadata on every chunk:** `source` (`usenix`|`defcon`|`schneier`) · `era` · `title` · `authors` · `year` · `url` · `rights` (`FREE/official`) · `cite` string.
3. **Attribution string examples:**
   - `USENIX Security ’03 — Provos et al., “Preventing Privilege Escalation” — https://www.usenix.org/...`
   - `DEF CON 32 — Moore & King, “SSHamble” — https://media.defcon.org/...`
4. **Embed/rerank:** reuse MODEL-PACK **`semantic-embedding-agent`** + **`retrieval-rerank-agent`** (nomic/bge **or** qwen3 lineages — operator pick). No new specialist GGUF.
5. **Answer path:** tool-router / general-text grounded on retrieval; prefer handbook+RFC for “how do I configure X on FreeBSD/Debian”, prefer this seed for “why does ASLR/CFI/TLS posture look like this”.
6. **Filter:** defensive / systems / netadmin vocabulary only in always-on; do not auto-ingest talk materials that are pure offensive exploit recipes without defensive framing (operator may still keep for on-demand research under separate approval).

### On-demand (not this pass)

- Full USENIX Security proceedings by year (browse https://www.usenix.org/publications/proceedings — Cloudflare may challenge automated fetch; prefer official PDF links from seed list).
- DEF CON video / torrent trees under https://media.defcon.org/ and https://defcon.org/ torrents page — **multi-GB; on-demand only**.

---

## Operator checklist

- [ ] Approve always-on seed size (keep 37 / cut per era to ~8)
- [ ] Confirm “cacert models” = curated/RAG (not CAcert CA corpus)
- [ ] Run fetch stubs on gapped-but-online host when ready (allowlist only)
- [ ] Defer all DEF CON **video** / torrent bulk
- [ ] Fill TBD URLs (C12 slides, M11 slides, M12 SoK pick)
- [ ] Chunk + embed into shared store with Crypto-Gram
- [ ] Update approval matrix rows A13/A14 (Crypto-Gram is A12) (done in companion HTML this date)

---

## Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | WebSearch + selective WebFetch; USENIX often Cloudflare-challenges automated fetch — landing URLs from search index treated as resolved when on `usenix.org` |
| Not done | Multi-GB video · full proceedings mirror · RAG embeddings build |
| Scripts | `knowledge/scripts/fetch-usenix-seed.sh` · `knowledge/scripts/fetch-defcon-slides-seed.sh` |
| Policy | `/workspace/knowledge/FETCH-POLICY.md` |
