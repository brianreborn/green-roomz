# X primary-source capture — 2026-09-12

## Access notes

- Requested public sources: [@born_brian85001](https://x.com/born_brian85001), [@BrianReborn_alt](https://x.com/BrianReborn_alt), and the two requested `from:` live-search URLs.
- Public profile pages were readable without entering credentials, but X exposed only a short public timeline window before the “See …’s full profile / Continue to X” login wall. Capture is therefore limited to the posts visible in that window; it is not a 30–50-post export.
- `from:born_brian85001` live search redirected to X login. The page asked “See what’s happening / Select an option below:” and offered Continue with phone, Continue with Google, Continue with Apple, or Email or username plus Continue. The `from:BrianReborn_alt` search was likewise login-gated (navigation was interrupted while loading).
- On the requested profile page, “Log in with username or email” was opened without entering credentials. The first route returned “Something went wrong”; direct `https://x.com/i/flow/login` then loaded the secure form.
- Fresh secure-form snapshot (no values entered):
  - `[ref=e5]` — visible label “Email or username”; type username/email (`input` text, name `username_or_email`).
  - `[ref=e6]` — unlabeled in the accessibility snapshot; type password (`input` password, name `password`).
  - `[ref=e13]` — duplicate/background Email or username text field rendered behind the modal; type username/email.
  - `[ref=e14]` — duplicate/background password field rendered behind the modal; type password.
- No credentials were typed, stored, submitted, or exposed. No posts, likes, follows, or other mutations were made.

## Posts by handle

### @born_brian85001 — 5 visible posts (all shown as recent relative times)

1. **13h (pinned)** — “Steven Feldman issuing threats against me and violating legal restraining orders currently.”  
   Post: https://x.com/born_brian85001/status/2098364811746971837  
   Linked URLs visible: none. **Flags:** security/oversight (legal-safety allegation); no direct note9/Termux, linguistics, compsci, networking, fleet, or paper content.

2. **3h** — “Steven Feldman is a serious piece of garbage who treats it as his life's work do all manner of terrible and unlawful things, lies and slander and vicious abuse, for his sick perversion and love of lies and filth.”  
   Post: https://x.com/born_brian85001/status/2098515905965887925  
   Linked URLs visible: none. **Flags:** personal/legal-risk context only; no direct release-plan topic.

3. **8h** — “Hey @grok, would you kindly watch this area for us? Thanks, bro!”  
   Post: https://x.com/born_brian85001/status/2098441257504911586  
   Linked URLs visible: `https://x.com/grok` (mention). **Flags:** monitoring/oversight; no direct note9 topic.

4. **9h** — “youtu.be/eIdKMiGJvcA?is… what a beautiful message! God will judge all, so we endeavor to repentance and vigilance.” The visible YouTube card read “YOUR TV & PHONE ARE HARMING YOUR SOUL” and “Computer games, Tv and 'phones serve to scatter the soul.”  
   Post: https://x.com/born_brian85001/status/2098420608879272043  
   Linked URL: https://youtu.be/eIdKMiGJvcA?is=3TwI4Zwjj3C6bn-i  
   **Flags:** computer/device-use (broad social commentary); not a compsci/security-model or note9 technical source.

5. **10h** — “Fairly clear this morning!”  
   Post: https://x.com/born_brian85001/status/2098418668187377767  
   Linked URLs visible: none (media attached). **Flags:** none of the requested themes.

### @BrianReborn_alt — 5 authored posts visible; 1 additional visible repost/item

1. **Sep 8** — “The evil pigs tried to murder me. They shattered one of my wrists and denied me all of my God-given rights.”  
   Linked URLs visible: none (image media attached). **Flags:** personal/security-safety allegation; no direct release-plan topic.

2. **Sep 8** — `@USSupremeCourt @UnitedStates @uscourts @USCERT_gov @USCERT @DARPA false-flag "government" terrorism and malfeasance against actual natural human Americans @cnnbrk` (video card visible, 00:33).  
   Linked URLs visible: mentions to `https://x.com/USSupremeCourt`, `https://x.com/UnitedStates`, `https://x.com/uscourts`, `https://x.com/USCERT_gov`, `https://x.com/USCERT`, `https://x.com/DARPA`, `https://x.com/cnnbrk`. **Flags:** security/government/oversight; not a security model or implementation detail.

3. **Sep 8** — “#Freemasonry = #Satanism QED”  
   Linked URLs visible: hashtag links `https://x.com/hashtag/Freemasonry` and `https://x.com/hashtag/Satanism`. **Flags:** none of the requested technical themes.

4. **Sep 7** — “@grok please cross-reference all of this with everything in the community on @born_brian85001's profile (descend into Tweet trees.) Please generate a small research paper that would fit in alongside his others exploring the connections that you find. Thank you, Grok!”  
   Linked URLs visible: `https://x.com/grok`, `https://x.com/born_brian85001`. **Flags:** papers/research, cross-referencing, OSINT-style analysis; no linguistics/compsci implementation specifics.

5. **Sep 6** — “Handlers are sub-human. #MKUltra #GodShallJudge”  
   Linked URLs visible: `https://x.com/hashtag/MKUltra`, `https://x.com/hashtag/GodShallJudge`. **Flags:** security/intelligence framing; no release-plan technical detail.

6. **Visible repost/item, Sep 7, authored by @born_brian85001** — “#OSINT @flightradar24 #public #oversight”  
   Post: https://x.com/born_brian85001/status/2097038424683524293  
   Linked URLs: `https://x.com/hashtag/OSINT`, `https://x.com/flightradar24`, `https://x.com/hashtag/public`, `https://x.com/hashtag/oversight`. **Flags:** OSINT/public oversight; possible fleet/monitoring relevance, but no networking/fleet implementation details.

7. **Visible repost/item, Sep 6, authored by Mr. Pool (@MrPool_QQ), not @BrianReborn_alt** — “🔻 THE WORLD HEALTH ORGANIZATION JUST CLASSIFIED ELECTROMAGNETIC FREQUENCIES AS A \"CLASS 1 THERAPEUTIC AGENT\" IN AN INTERNAL DOCUMENT THAT WAS NEVER RELEASED TO THE PUBLIC. THE DOCUMENT IS DATED MARCH 14, 2026.\n\nNot \"alternative.\" Not \"complementary.\" Not \"under investigation.\" Show more”  
   Post: https://x.com/MrPool_QQ/status/2096729627913785495  
   **Flags:** claim/document provenance; not a note9 technical source. Text is recorded only through the visible “Show more” truncation.

## Themes for note9 release

- **Security / trust boundary:** the visible material is mostly personal safety, legal-threat, government-oversight, monitoring, and OSINT language. It supports documenting an abuse-reporting/oversight posture and careful provenance, but does not provide a concrete security model, cryptographic design, or threat matrix.
- **Linguistics:** no captured posts discuss tokenizer, Unicode, locale, language modeling, or related linguistic release requirements.
- **Compsci / note9 / Termux:** no captured post names Green-Roomz, note9, Termux, code, packages, tests, or a software release artifact. The “computer games, Tv and 'phones” card is social commentary only.
- **Networking / tunnels / NAT / ISP / federation:** no captured post provides tunnel, NAT, ISP, federation, or transport details.
- **Fleet / public monitoring:** the OSINT + Flightradar24 + public oversight repost is the closest visible fleet/monitoring hit, but it has no architecture or operational details.
- **Council / FreeBSD / MAC / papers:** no council, FreeBSD, or MAC post was visible. One post requests a small research paper and cross-reference, but no paper content was shown.
- **Evidence quality:** timestamps are recorded exactly as X rendered them (relative hours for @born_brian85001; calendar dates for @BrianReborn_alt). Search results and deeper timelines were login-gated, so absence here is not evidence that the accounts have no other relevant posts.
