# Knowledge addendum — Schneier FREE pack vs EXCLUDE-FROM-MIRROR — 2026-09-12

**Audience:** operator Brian  
**Companions:** `KNOWLEDGE-LIBRARY-CANDIDATES-2026-09-12.md` §1/#13 + §4 · `knowledge-approval-matrix.html` A12 / B1–B10  
**Pack:** `/workspace/knowledge/schneier-crypto-gram/` · tarball `/workspace/knowledge/schneier-crypto-gram.tar.gz`

## APPROVED-FREE — Crypto-Gram entire-issue pack

| Field | Value |
|-------|-------|
| Status | **APPROVED-FREE** |
| Work | Crypto-Gram newsletter (complete issues) |
| Author | Bruce Schneier |
| Source | Official only: https://www.schneier.com/crypto-gram/ |
| Rights basis | Issue reprint grant: *“Permission is also granted to reprint CRYPTO-GRAM, as long as it is reprinted in its entirety.”* (quoted from 2026-08-15 and same grant on 2000-05-15) |
| What ships | Entire issues as HTML + markdown; attribution + source URL on every file |
| Starter count | **72** issues (recent 12 months 2025-09…2026-08 + all of 2000, 2005, 2010, 2015, 2020) |
| Catalog | 342 official issues on schneier.com (1998-05-15 … 2026-08-15); remainder via `fetch-more.sh` |
| Failed URLs | none |
| Not included | Blog comments; book text; third-party PDF dumps |

Always-on corpus item **#13 / A12**. Matrix row **B4** upgraded from “essay index only” to this entire-issue pack.

## EXCLUDE-FROM-MIRROR — commercial / CDL Internet Archive items

Do **not** download, extract, or kit-redistribute these. Cite or OWN-path only.

| ID | Work | IA item (pointer only) | Rule |
|----|------|------------------------|------|
| B1 | Applied Cryptography (Schneier) | `appliedcryptogra0000schn` | **EXCLUDE-FROM-MIRROR** · BORROW/OWN |
| B2 | Secrets and Lies (Schneier) | `secretsliesdigit0000schn_n2e3` | **EXCLUDE-FROM-MIRROR** · BORROW/OWN |
| B3 | Data and Goliath (Schneier) | `datagoliathhidde0000schn` | **EXCLUDE-FROM-MIRROR** · BORROW/OWN |
| B5 | TAOCP vol set (Knuth) | `artofcomputerpro0001knut_l0h13rdedition` | **EXCLUDE-FROM-MIRROR** · BORROW/OWN |
| B6 | Concrete Mathematics | `B-001-002-135` | **EXCLUDE-FROM-MIRROR** · VERIFY/OWN |
| B7 | Gödel, Escher, Bach | `gdelescherbach00hofs` · `gdelescherbachan00hofs` | **EXCLUDE-FROM-MIRROR** · BORROW/OWN |
| B8 | I Am a Strange Loop | `iamstrangeloop0000hofs` | **EXCLUDE-FROM-MIRROR** · BORROW/OWN |
| B9 | The Mind’s I | `mindsifantasiesr0000hofs` | **EXCLUDE-FROM-MIRROR** · BORROW/OWN |
| B10 | TCP/IP Illustrated (Stevens) | `tcpipillustrated00stev` | **EXCLUDE-FROM-MIRROR** · VERIFY — do not trust PD Mark |

Unverified “Public Domain Mark” uploads of commercial titles are still **EXCLUDE-FROM-MIRROR**.

## Fetch policy

Trusted sources only: `schneier.com` official pages, `web.archive.org` snapshots of **those same** pages, official FreeBSD/Debian docs, IETF RFCs.  
`fetch-more.sh` in the pack talks to schneier.com only.
