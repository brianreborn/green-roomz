# Knowledge Pack Policy — 2026-09-12

**Operator:** Brian  
**Status:** Active operator policy update  
**Companion UI:** `knowledge-approval-matrix.html` (keep approval-matrix look/UX)  
**Corpus path:** `/workspace/knowledge/os-handbooks/` → extreme archive `/workspace/knowledge/os-handbooks-extreme.tar.zst`

---

## 1. Always-on = full official handbooks + security chapters

**Policy change (2026-09-12):** Popular **official OS handbooks** and similar **official platform docs** are **fair game for always-on**, shipped as **APPROVED-FULL-COMPRESSED** (not extract-only).

| Class | Always-on treatment |
|-------|---------------------|
| FreeBSD Handbook (official PDF / docs.freebsd.org) | **FULL** compressed |
| Debian Administrator’s Handbook (free CC-BY-SA/GPL ebook from debian-handbook.info / debian.org) | **FULL** compressed |
| HardenedBSD wiki / docs export (official) | **FULL** compressed (delta + features) |
| OpenBSD FAQ + PF docs (openbsd.org / official mirrors) | **FULL** compressed |
| Linux: official kernel security/admin docs, man-pages, Debian Securing Manual, Ubuntu security how-tos | **FULL** relevant official trees compressed |
| Alpine | Thin official pointers + wiki pages that resolve |

**Purpose of the pack**

1. **Accurately test for known and similar vulnerabilities** on kit OS lines (FreeBSD / pqfreebsd, Debian-class, HardenedBSD, OpenBSD-adjacent PF mental model, Linux).  
2. **Harden platforms significantly by default** — first-boot / image-build checklist driven by handbook sections (see `/workspace/knowledge/harden-default/`).

Defensive use only: harden + detect/verify known classes. **No exploit recipes, PoCs, or offensive playbooks** in this pack.

---

## 2. Extreme compression (mandatory for full texts)

Prefer **extreme** compressors so full handbooks fit airgap cells:

| Prefer | Command shape |
|--------|----------------|
| **Primary** | `tar -cf - <tree> \| zstd -19 -T0 -o os-handbooks-extreme.tar.zst` |
| **Alternate** | `tar -cf - <tree> \| xz -9e -T0 > os-handbooks-extreme.tar.xz` |

Record **original vs compressed sizes** and **SHA256** in `MANIFEST.md` beside the archive.

Rationale: previous extract-only bias saved disk but starved RAG of chapter context needed for harden-default and vuln-class recall. Extreme compression restores **full official text** at acceptable always-on cost.

---

## 3. Rights / source rules (unchanged hard lines)

| Allowed | Not allowed |
|---------|-------------|
| Official project handbooks & security manuals | Commercial **Schneier / Knuth / Hofstadter** book mirrors |
| **Crypto-Gram** / free schneier.com essays (index + free pieces) | Bulk IA scans of commercial titles without rights |
| **USENIX OA** + **DEF CON** media (as previously approved) | Shady / unofficial handbook mirrors when official URL fails |
| CC / DFSG / project-licensed free editions | Invented GGUF names or fake Archive.org IDs |

If an official download **fails**, document **URL + HTTP reason** in the fetch log; **do not** substitute shady mirrors. Fall back to another **official** format/edition on the same project host when available (e.g. Debian stable EPUB when stable PDF 404s).

---

## 4. Approval matrix UX

Keep the existing **dark-theme approval-matrix** look (`knowledge-approval-matrix.html`):

- Groups A–D, FREE / BORROW / OWN / OPS / DEFER pills  
- OS handbook rows marked **`APPROVED-FULL-COMPRESSED`** (Include) — not “chapter extracts only”  
- Classics (Schneier books, Knuth, Hofstadter, Stevens) remain **Cite-only / BORROW-OWN** — no kit mirror

Update `KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md` in lockstep with the matrix.

---

## 5. Harden-default + vuln-test use cases

| Use case | Pack role |
|----------|-----------|
| **Harden-by-default** | Image/first-boot checklist maps to FreeBSD / Debian / HardenedBSD handbook sections (`knowledge/harden-default/`) |
| **Vuln-class testing** | Ground truth for *known and similar* vulnerability classes, secure defaults, audit tooling names (`pkg audit`, debsecan-class, HBSD controls) — defensive verification only |
| **netadmin-rag** | Prefer full compressed handbooks as corpus over thin extracts |

---

## 6. Document control

| Field | Value |
|-------|-------|
| Effective | 2026-09-12 |
| Supersedes | Extract-only always-on bias for popular OS handbooks in earlier 2026-09-12 candidates draft |
| Fetch log | `/workspace/knowledge/os-handbooks/FETCH-LOG-2026-09-12.md` |
| Archive | `/workspace/knowledge/os-handbooks-extreme.tar.zst` |
