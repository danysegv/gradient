# 04AM — handoff for a fresh chat
_Current as of 2026-09-04. Paste this whole thing into a new window._
Supersedes the 2026-09-01 version. Direction docs: `claude/04am-direction-memo.md`,
`claude/04am-three-month-plan.md`. Deep detail: `claude/04am-handoff.md`.
Session findings: `claude/04am-session-2026-09-01.md` · Build log: `claude/04am-build-2026-09-02.md`.

> **Do not trust the numbers in this file. Re-derive them.**
> **`scripts/panel-report.ts` DOES NOT RUN ANY MORE — do not waste a turn on it.**
> It fails with `EAI_AGAIN faxdpkqkufbywoxfmnka.supabase.co` on the cloud VM *and* on the Mac,
> because the Claude file bridge runs commands in an isolated Linux VM whose egress does not
> include Supabase. **Use the Supabase MCP tools (`execute_sql`) instead** — the formulas are
> small and fully specified in `lib/velocity.ts` and `lib/curator-velocity.ts`, and SQL versions
> reproduce the script's output exactly. This was verified on 2026-09-01.

---

## What 04AM is
Trend-intelligence platform for creatives. **"Bloomberg Terminal for creatives."** Cosmos/Savee
give visual inspiration with no signal; WGSN gives real data at enterprise prices. 04AM is the
middle. Renamed from "Gradient" — code rename complete, Vercel URL still carries the old name.
**04AM is a terminal AND a magazine** (decided 2026-08-26/27, do not relitigate).

## Stack
- `/Users/danielahenriquessegovia/my-app` — Next.js 16.2.12, React 19.2.4, Tailwind v4, TS, App Router
- Supabase ref `faxdpkqkufbywoxfmnka` — `clips`, `clip_tags`, `tags`, plus RPCs
- Live at `gradient-flax.vercel.app`
- **`npm test` → 57 tests**, `tsc --noEmit` and `eslint` clean
- **Magic-link / Supabase Auth tried twice, failed, fully reverted. Do not reintroduce.**

### RPCs in the database (all additive `create or replace`)
`tag_velocity_counts` · `library_clip_stats` · `curator_tag_counts` · `curator_clip_stats` ·
`unclassified_clips` · `tag_curator_breakdown` · `tag_cooccurrence` · `curator_composition`
They exist so pages stop fetching whole tables and filtering in JS. **PostgREST caps rows at 1000
without erroring — assume any unbounded `.select()` is lying to you.** Three silent-truncation bugs
were fixed this way.

---

## ⚠ THE REPO HAS 3 UNPUSHED COMMITS AND UNCOMMITTED WORK

```
2344cb6  Universal terms live on the clip page only
e5d2c04  Curator profiles: the roster, a signature, and a page-wide overflow fix
a7c1ebd  Clip detail page, and both tag names on the surfaces that search
```
Uncommitted: `app/clip-login/actions.ts`, `app/clip/page.tsx`, `components/clipper-grid.tsx`,
and untracked `app/clip/logout-actions.ts` (Safari cookie fix + sign-out + clipper grid link).

**Nothing built today has ever been compiled for production.** `npm run build` cannot run through
the file bridge — the Linux VM cannot load Next's SWC binary against macOS `node_modules`
(`Failed to load SWC binary for linux/arm64`). tsc, eslint and `npm test` all work there; **the
build and the dev server must run on the Mac itself.** Run `npm run build` before pushing.

**Daniela does all `git push` herself. Claude never authenticates as her to any remote.**

---

## Data state (live, 2026-09-04 18:05 UTC)
**125 active clips / 183 total · 114 classified · 441 tag-applications across 19 tags in use**
(21 seeded; MotionLoop and StoryScroll still at zero).

| curator | clips | tag-applications |
|---|---|---|
| danysegv | 93 | 320 |
| lumalhaes | 21 | 85 |
| **igorsurrealism** | 11 | 36 |

**Attribution has improved a lot:** 71 clips have a `creator`, 32 have `source_year`, and only
**28** still have neither `creator` nor `rights_holder` (was 76 on 09-01).

### Band standings (refs ≥ 15) and real 45-day gate moments, ET
| tag | refs | gate lifts |
|---|---|---|
| RawAsymmetry | 59 | **2026-09-24 11:01** |
| AnalogNoise | 58 | 2026-09-26 03:35 |
| BoldGrotesk | 57 | **2026-09-24 11:01** |
| FrontalSymmetry | 50 | 2026-09-26 03:27 |
| HighEnergy | 44 | **2026-09-24 11:01** |
| Poetcore | 21 | 2026-09-26 03:55 |
| Zinepunk | 21 | 2026-09-26 03:27 |
| AmberGlow | 20 | 2026-09-26 03:55 |
| VampTones | 16 | 2026-09-26 03:35 |
| Sciura / LensBloom / Cyberpunk | 15 each | 09-26 04:01 / 09-26 03:56 / **09-24 11:01** |

---

## ⚠ THE REAL DECISION: 09-24 vs 09-26

Projected to **2026-09-24 11:02 ET**, drift **19.32%** — under the 20% gate, so the global number
is publishable. The board that day is **four tags and every one is negative**:

| tag | refs | velocity (pooled, pts) |
|---|---|---|
| RawAsymmetry | 59 | −1.26 |
| BoldGrotesk | 57 | −2.97 |
| HighEnergy | 44 | −2.19 |
| Cyberpunk | 15 | −1.24 |

**Two days later, on 09-26, the age gate opens for everything else** and the board becomes twelve
tags including the positives: **AmberGlow +1.96, Poetcore +1.73, LensBloom +1.36, Sciura +0.93,
FrontalSymmetry +0.78, VampTones +0.70**, alongside AnalogNoise −1.03 and Zinepunk −1.73.

**Launching the terminal on 09-24 means opening with four red numbers and nothing rising.
Waiting 48 hours gives a real board.** This is the single most consequential open decision.

## Panel drift — how it actually behaves
Drift = total-variation distance between the trailing-30-day curator mix and the all-time mix;
gate is `MAX_PANEL_DRIFT = 0.20`. Current projection 19.32% at 09-24 (danysegv 72.6% base /
53.2% window, lumalhaes 19.3/31.2, igorsurrealism 8.2/15.6).

**A brand-new curator inflates drift**, because they have no all-time history — their window share
necessarily exceeds their base share. **But this is offset when the existing curators keep
clipping.** A projection made on 09-03 that froze Daniela and Luma predicted Igor would push drift
over 20% with as few as 10 tag-applications; he has since made 36 and drift is *under* the gate,
because the other two kept clipping too. **Do not project drift with clipping frozen — it is
misleading in both directions.**

Still worth deciding: `computePanelComposition` applies **no** minimum-volume floor, while
`computeBalancedVelocities` requires 30 tag-applications on both sides before a curator counts.
A curator with 8 tag-applications can currently withhold the entire public board. **Proposal (not
yet written up, not yet built): apply the same `MIN_CURATOR_BASE_VOLUME` floor to the gate**, so
joining the panel doesn't read as the culture changing. This is a change to a locked metric —
Daniela's call.

---

## Shipped this session (all local, unpushed)

### `/clip/[id]` — the clip detail page
Clicking a clip used to eject straight to the source host, handing away the visit, the credit chain
and the tagging layer. Now: full-size image (capped 78vh, letterboxed), credit block (creator /
rights holder / year / found via, with an honest empty state), curator + date linking to their
profile, every trait with **editorial name + universal term + description** grouped by axis, and a
**"Shares traits with"** rail ranked by tag overlap — computed from the clip, never the viewer.
Source link kept as a deliberate button. The clipper's own grid now opens it too.

**It is a sibling of the clipper at `/clip`, not a child. There is no `middleware.ts`** — `/clip`
gates itself inside its own page component — so the detail page is public. A future middleware must
exclude `/clip/<uuid>` explicitly or the page disappears behind the password gate.

### `/curators` — the panel roster
Every curator with clips, tag applications, share, and a strip of recent work, plus the panel gate.
**Reports drift as "Not yet readable" rather than 0.0%** while the trailing window still covers the
whole library — encoding the 09-01 correction into the product.

### Signature block on `/curator/[name]`
The tags a curator pulls toward and away from: their share of their own tagging minus the library's
share, in points, diverging Oxide/Slate from zero. Ranking a curator's tags by raw count mostly
reproduces the library's biggest tags. Iterates **every** library tag, not only ones they've
touched. Withheld below `MIN_CURATOR_BASE_VOLUME`. Costs no new queries.

### Universal terms — placement resolved
`tags.universal_term` is `NOT NULL` and populated for all 21 tags; the data was never the gap.
**Daniela's call after seeing it live: it belongs under the editorial name on `/clip/[id]` only —
not on filter chips, not on Signature rows.** The trending cards on `/` and `/curator`, the tag
header on `/trend`, and the clipper all still pair both names; those predate this and were kept.

### Pre-existing bug fixed
`body` is `flex flex-col`, and a stretched flex item sizes to max-content, so the 8 × 168px "Their
tags" rail forced every page container to its `max-w-[1180px]` and **the whole site scrolled
sideways below 1180px viewport** — `overflow-x-auto` never engaged. Page wrappers now carry
`w-full min-w-0`. Verified at 876px: `body.scrollWidth` was 1180, now 876.

Also: JSX strips leading whitespace on lines after the first in a text node — it silently ate a
space and rendered "danysegvclips". Use explicit `{" "}`.

---

## ⚠ /genome — the headline finding does not hold (audit, 2026-09-01)

The page's central claim — 86% one way, "only 37% the other way", *"that difference is the part
worth knowing"* — **is Bayes' theorem, not a finding.** `P(A│B) ÷ P(B│A) = n(A) ÷ n(B)`; the shared
numerator cancels. Verified on live data: **26 of 26 qualifying pairs, maximum deviation 0.000.**
Every "only X% the other way" is the forward figure divided by the two tags' size ratio.

- The One-Way Dependencies list is ordered by **forward share**, not lopsidedness as its copy claims.
- Of its five rows: two real (Zinepunk+AnalogNoise 1.69×, AmberGlow+AnalogNoise 1.38×), one
  marginal (1.11×), two noise — **BoldGrotesk+Zinepunk sits at lift 0.99, exactly chance.**
- "AnalogNoise is a substrate" survives on other evidence. **"RawAsymmetry is a substrate" does
  not** — mean lift 0.89, below chance.
- The bright vertical band in the matrix is a **base-rate artifact**: it reads tag size, not affinity.

**Fix (not built, reverses a documented design decision, so it is Daniela's call):** rank by lift;
retire the "other way" column; colour cells diverging from 1.00 (Oxide above chance, Slate below —
the identity's existing semantics); add an expected-count floor of ~5 as the pairwise equivalent of
`EARLY_SIGNAL_MAX`. `tag_cooccurrence` already returns everything needed — render-layer arithmetic.

Artifact: **The Base-Rate Illusion** —
https://claude.ai/code/artifact/891ba233-8111-403a-905c-e0f88f89970b

> ⚠ The lift figures above were computed at N=102 classified clips. The library is now at 114.
> **Recompute before quoting any of them.** The structural conclusions should hold; the decimals won't.

## The finding worth writing (Feature №1)
**RawAsymmetry × FrontalSymmetry, lift 0.08** — 54 and 46 references sharing 2 clips where
independence predicts 24. The two biggest layout tags in the library repel each other: opposed
compositional grammars, and a curator picks one.

Tested for the obvious objection — that it is just two curators with opposite taste:

| curator | clips | RawAsymmetry | FrontalSymmetry | both | expected | lift |
|---|---|---|---|---|---|---|
| danysegv | 80 | 47 | 31 | 1 | 18.2 | **0.05** |
| lumalhaes | 22 | 7 | 15 | 1 | 4.8 | **0.21** |

**It survives the split.** Each curator independently almost never puts both traits on one image, so
it is a property of the images, not of who clipped them. That it *also* divides the curators
(Luma leans +5.0 pts toward FrontalSymmetry; Daniela −1.5 away, +1.7 toward RawAsymmetry) is a
second, better story. **Zero engineering. Still the actual test.**

---

## Curators & the clipper gate
`CLIP_CURATORS="name:secret,name:secret"` in env; cookie is `<name>.<sha256(name:secret)>`, never
the secret. Per-curator secrets mean rotating one signs out only that person. Names must not
contain `:` `,` or `.` (pair delimiters and the cookie split). **`lib/clip-auth.ts` caches the
parsed list at module level — restart the dev server after changing the env.**

- **`igorsurrealism` was added 2026-09-03** and is in `.env.local` only.
  **Verify he is in Vercel** — he cannot clip on production until that value is added and
  redeployed. (He has 11 clips already, so this may already have been done.)
- **Sign-out now exists** (`app/clip/logout-actions.ts` + button next to "Clipping as"). Before
  this there was no way out of a 30-day `httpOnly` cookie except devtools or a private window.
- **Safari refuses `Secure` cookies on `http://localhost`** (Chrome/Firefox special-case localhost).
  The login cookie is now `secure: process.env.NODE_ENV === "production"`. Production unchanged.
- `.env.local` is gitignored (`.gitignore:34 .env*`) and untracked — secrets cannot reach git.
- **Still unverified:** does the live `/clip` say "Clipping as danysegv" or "Clipping as curator"?
  If the latter, production is on the legacy `CLIP_GATE_SECRET` fallback and every clip made there
  is stamped `"curator"`. Carried unverified since 09-01.

## ⚠ Security note — the RSC precaution protects nothing
RLS policy `anon read clips` is `qual: true`, and `anon` holds column-level `SELECT` on
`clipped_by_name`. The publishable key ships in the browser bundle, so **anyone can already query
curator names off the REST endpoint.** "Don't select the column" is not a privacy control.
**Writes are safe** — no anon `INSERT`/`UPDATE`/`DELETE` policy exists, so the column grants are
inert and RLS denies by default. Verified, not assumed.

---

## Environment gotchas (hard-won, do not rediscover)
- **`device_bash` runs in a Linux VM on the Mac, not macOS.** It cannot see macOS processes, cannot
  run `npm run dev`/`build` (no SWC for linux/arm64 against macOS `node_modules`), and has **no
  network route to Supabase**. It CAN run `tsc`, `eslint`, `npm test`, `node`, `python3`, `git`.
- **The mount cannot `unlink`.** `rm`, `git mv`, `git checkout` all fail with "Operation not
  permitted". Plain `mv` works — sweep `.git/index.lock` and `.git/HEAD.lock` to
  `*.lock.trash.$RANDOM` *within* `.git/` when a commit fails. Restore a clobbered file with
  `git cat-file -p HEAD:file > file` (truncate-in-place).
- Commits from the bridge need `git -c user.name=... -c user.email=...` inline.
- **Every scripted string replacement must `assert old in s` first.**
- Browser verification works: the dev server runs on the Mac and Claude-in-Chrome reaches
  `localhost:3000`. Use `javascript_tool` to read the DOM — screenshots alone missed a
  page-wide overflow bug and falsely suggested a broken image that was merely mid-load.
- Supabase transient "JWT issued at future" on reads clears on retry; don't debug it in app code.
- **PostgREST serialises `bigint` as a JSON string.** Coerce with `Number()` once, at the boundary.

## Locked — do not relitigate
- Ink `#0B0A0E`, Bone `#E7E3D8`, Slate `#5C6B87`, Oxide `#B4453A`, `--ink-2` `#131218`
- Archivo. Bold never touches a number. **Oxide/Slate never as small text.** `bone/50` is exactly
  the 4.5:1 line — below it fails. (Two violations remain in `genome-matrix.tsx`: line 94
  `text-bone/40` at 10px, line 89 `text-bone/45` at 13px.)
- Wordmark only, no icon. Pull the path verbatim from `04am-wordmark-tight.svg`.
- Bands: <15 Early Signal · 15–40 velocity+count · >40 full stat · 45-day age gate · no refs in
  30d = Cooling in Slate. **`EARLY_SIGNAL_MAX = 14`, `FULL_STAT_MIN = 41` are exported — import
  them, never retype the number.**
- Velocity: `recentShare` (trailing 30d) − `baseShare` (all-time), in points. Null below 30
  tag-applications library-wide. **The time axis stays locked. The curator axis is additive.**
  `RECENT_WINDOW_DAYS = 30` is exported and passed *into* the RPCs.
- Grid: `gap-4`, `xl:columns-6`, 3px radius, fade-in, bottom-anchored hover scrim.
- Profiles: yes, name-based, derived from clips. **No auth. No follower graph.**

## OPEN — blocking
1. **Launch 09-24 or 09-26?** Four red numbers vs. a real twelve-tag board. Most consequential.
2. **Are curator names public?** `/clip/[id]`, `/curators`, `/curator/[name]` and `/trend/[name]`
   are **all `noindex`** pending this. One line each to flip. The clip page is the most valuable
   page in the product to have indexed — it's the credit page.
3. **Apply the volume floor to the panel gate?** Change to a locked metric.
4. **Fix `/genome` to rank by lift?** Reverses a documented design decision.
5. **Name the "Panel Skew" state** — mechanism settled, wording is Daniela's.
6. **How does membership work?** — the reason the invitation page is shelved
   (branch `shelved/invitation-page` at `26fd2ad`, route moved to `.shelved/invitation`, untracked).
7. Do profiles get a `curators` table for bio/avatar? (Built derived-only, no schema.)
8. Drop the empty `invitation_requests` table?

## Immediate next steps
1. **`npm run build` on the Mac, then push.** Four commits' worth of never-built code.
2. **Confirm `igorsurrealism` is in Vercel's `CLIP_CURATORS`** and that the live clipper says
   "Clipping as danysegv", not "Clipping as curator".
3. Answer the 09-24 / 09-26 question.
4. Answer curator privacy; `REVOKE` or flip the four `noindex` lines.
5. **Write Feature №1** — RawAsymmetry × FrontalSymmetry. Zero engineering.
6. Mac cleanup (the mount cannot unlink): `find .git -name 'tmp_obj_*' -delete` ·
   `find .git -name '*.trash.*' -delete` · `rm -rf .shelved/cleanup`
7. Backfill remaining attribution — 28 clips still have no creator or rights holder:
   `npx tsx scripts/backfill-attribution.ts --dry-run`, read it, then drop the flag.
8. Shared `<SiteNav>` — nav is duplicated inline across seven files.
9. Buy a cheap domain for the Instagram bio link; trademark search before the `.com`.
   (`04am.com` is squatted, $2,999. There is an existing agency **4:AM** in Auckland, `4am.co` —
   **do not buy `04am.co`**.) Rename the Vercel project off "gradient". Register a DMCA §512 agent.
10. **Trend Radar stays deferred** until after the gate opens. A chart of zeros is worse than none.

## Corrections logged
- Reporting panel drift of 0.0% as good news is wrong while the window covers the whole library.
- "6 of 19 tags flip sign between pooled and balanced" is stale — it was 3 of 19 on 09-01, and
  **BoldGrotesk no longer flips.** The Curator Confound artifact's headline example is out of date;
  the mechanism it documents is not.
- **A drift projection that freezes clipping is wrong in both directions.** On 09-03 Claude
  predicted Igor would shut the 09-24 gate with 10 tag-applications; he made 36 and the gate is
  still open, because the other two curators kept clipping.
- Screenshots are not verification. A page-wide horizontal overflow bug and a correctly-working
  image both looked like the opposite until the DOM was queried directly.
