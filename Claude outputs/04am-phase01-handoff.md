# 04AM — NEXT TASK: build the incubator (Phase 01)

_Paste this whole thing into a new window. Written 2026-09-06._

**Full context:** `claude/04am-new-chat-summary.md` (general handoff) ·
`claude/04am-taxonomy-2026-09-04.md` (reasoning, sections 9 and 10 matter most) ·
`claude/04am-taxonomy-expansion.sql` (the migration, ready to run) ·
Runbook: https://claude.ai/code/artifact/5598a19c-e584-45eb-9ada-fba74141c6d8

---

## The task in one paragraph

04AM is adding **37 tags (21 → 58, 6 → 8 axes)**. They must go in **frozen**: applied to clips
and accumulating history, but invisible to every public metric until they graduate ~Nov 11. This
phase builds that freeze, updates the classifier, and runs the migration — **before** the 09-26
board launch, with nothing visibly changing.

**Success looks like:** the migration has run, `select count(*) from tags` returns 58, and every
number on the public board is byte-identical to what it was before.

---

## Verified state (2026-09-06 — re-derive anyway)

- Repo `/Users/danielahenriquessegovia/my-app`, HEAD = `origin/main` = **`b86f817`**, clean,
  built (`.next/BUILD_ID` written 09-04 21:18 UTC). Nothing unpushed.
- **126 active clips · 115 classified · 445 tag-applications · 21 tags · 6 axes.**
- No clipping since **09-04 18:23** — the library has been static.
- **No `published_at` column on `tags` yet.** Migration not run.
- 09-26 board (library-wide velocity): Poetcore +2.46 · LensBloom +1.72 · AmberGlow +1.52 ·
  Sciura +0.80 · VampTones +0.57 · FrontalSymmetry +0.11 · RawAsymmetry −0.76 · AnalogNoise
  −1.46 · Cyberpunk −1.52 · BoldGrotesk −1.92 · HighEnergy −2.24 · Zinepunk −2.40.
  **Panel drift 14.01%** against a 20% gate. These are the numbers step 1.10 must not move.

---

## ⚠ THE THING THAT WILL BITE YOU

**Tagging is fully automated.** `lib/claude/classify-clip.ts` sends each clip's image to
claude-opus-5 with the taxonomy loaded live from the database:

```ts
.from("tags").select("id, group, editorial_name, universal_term, description")
.neq("group", "format_motion")
```

Classification fires from `after()` on clip creation and from the reclassify batch. **No human
picks tags.** Therefore:

**The moment the migration runs, the classifier starts applying the new tags.** There is no
"turn them on later" switch unless one is built. If the migration lands before the classifier
filter exists, new-vocabulary applications enter the 09-26 launch window and drop RawAsymmetry
toward **−16 points** — a published number caused by our own incubation.

**So: 1.2 must ship before 1.9. Non-negotiable ordering.**

---

## The ten steps

| # | What | Where |
|---|---|---|
| 1.1 | Add `published_at timestamptz null` to `tags`. Null = frozen. | migration |
| **1.2** | **Filter the classifier query on `published_at`** | `lib/claude/classify-clip.ts` |
| 1.3 | Filter all eight RPCs on `published_at` | Supabase |
| 1.4 | Prompt says "five axes" — make it eight | `lib/claude/classify-clip.ts` |
| 1.5 | Review the 37 descriptions **as prompt content** | migration SQL |
| 1.6 | Write the reclassify-against-widened-taxonomy path | new |
| 1.7 | Suspend Cooling on axes carrying frozen tags | `lib/velocity.ts` + surfaces |
| 1.8 | Run STEP 1 (enum) — **let it commit** | migration |
| 1.9 | Run STEP 2 (37 inserts, all frozen) | migration |
| 1.10 | Verify the board did not move | `execute_sql` |

### 1.2 — the write-path guard
Add the frozen-tag exclusion alongside the existing `.neq("group","format_motion")`. This is the
load-bearing change: read-path filtering cannot hold a freeze when the write path is a model
reading the database directly.

### 1.4 — the prompt
The system prompt hardcodes:
> "…a faceted system across **five axes** (movement, typography, palette_light, layout,
> treatment). … For each axis, pick at most the single best-matching tag — never force a weak
> match."

Must name **eight** once `medium` and `subject` exist, or the model receives an eight-axis
taxonomy under a five-axis instruction. **This one sentence is the entirety of what earlier
sessions called "the clipper rework."** There is no tag-picking UI.

### 1.5 — descriptions are production prompt content
`tags.description` is interpolated straight into the system prompt as
`- Name (group, aka "Universal Term"): description`. It **is** the tagging guide. The 37 new
descriptions determine classification quality directly. Highest-leverage hour in the phase.

### 1.6 — the missing path
`getUnclassifiedClips` returns only clips with **zero** tags, so the 115 classified clips will
never receive `medium` or `subject`. The file's own comment says so: *"this does NOT catch clips
that already have stale tags from before a taxonomy change — that's a different mode."*
Write that mode. It is used in Phase 05, not now, but scope it here.

### 1.7 — the Cooling trap
Band rule: "no refs in 30 days = Cooling, in Slate." Thin tags are thin — **Brainrot 1 ref in 14
days, HandType 2, ChoppyType 5**. Once the classifier can reach TechMono or StretchType, those
can go 30 days untouched and read as dying looks when the vocabulary merely got more precise.
Suspend Cooling per-axis while that axis carries frozen tags; it reverses at graduation.

### 1.8 / 1.9 — ordering
`ALTER TYPE tag_group ADD VALUE` commits fine on PG 17.6, **but the new label cannot be USED
until that transaction commits.** Two separate migrations or the inserts fail with
"unsafe use of new value of enum type."

### 1.10 — the verification that matters
With the classifier filtered and zero applications on frozen tags, **every published number must
be identical before and after.** Snapshot the 12-tag board and drift before 1.8; re-run after
1.9; diff. Any movement means a filter was missed — and this is the cheapest moment to find out.

---

## Do NOT

- **Do not let the classifier see the new tags before 09-27.** That is Phase 03.
- **Do not backfill the five existing axes.** They are single-select; re-running the classifier
  against a widened layout axis replaces the existing layout tag, rewriting base and recent
  shares and silently restating published numbers. `medium` and `subject` are the exception —
  they remove nothing.
- **Do not backdate `clip_tags.created_at`.** A backdated application claims a reading never taken.
- **Do not ship Feature №1** (RawAsymmetry × FrontalSymmetry). It restates the single-select
  instruction. All 35 same-axis pairs sit at mean lift 0.010 vs 0.962 cross-axis.
- **Do not quote a young tag's velocity.** LiquidGradients reads +4.34 rising and is actually
  −1.21 falling — 128% artifact. The matched-baseline fix is Phase 04, not this phase.

---

## Environment gotchas

- **`scripts/panel-report.ts` does not run** — EAI_AGAIN, the bridge VM has no route to Supabase.
  Use the Supabase MCP `execute_sql`. Formulas are in `lib/velocity.ts` / `lib/curator-velocity.ts`.
- **`device_bash` runs in a Linux VM, not macOS.** It cannot run `npm run dev`/`build` (no SWC
  for linux/arm64 against macOS `node_modules`) and has no network route to Supabase. It CAN run
  `tsc`, `eslint`, `npm test`, `node`, `python3`, `git`.
- **The mount cannot `unlink`.** `rm`, `git mv`, `git checkout` fail with "Operation not
  permitted". Plain `mv` works.
- **Daniela does every `git push` herself.** Never authenticate as her.
- **`npm test` → 57 tests** must still pass. Add: a uniformly-applied new tag resolves to
  velocity 0; a frozen tag is absent from every published denominator **and** from the
  classifier's taxonomy.
- PostgREST caps rows at 1000 without erroring. It serialises `bigint` as a string — `Number()`
  once, at the boundary.

---

## Locked — do not relitigate

Ink `#0B0A0E` · Bone `#E7E3D8` · Slate `#5C6B87` · Oxide `#B4453A` · `--ink-2` `#131218`.
Archivo; bold never touches a number; Oxide/Slate never as small text; `bone/50` is the 4.5:1 line.
Bands: <15 Early Signal · 15–40 velocity+count · >40 full stat · 45-day age gate · no refs in 30d
= Cooling. `EARLY_SIGNAL_MAX = 14`, `FULL_STAT_MIN = 41`, `RECENT_WINDOW_DAYS = 30` are exported —
import them. Launch is **09-26**, decided. New vocabulary opens **09-27**, not a day earlier.

---

## Open decisions blocking nothing in this phase, but still open

1. **Are curator names public?** Four `noindex` lines. No half-measure exists — `anon` already
   holds column-level SELECT on `clipped_by_name` and the publishable key ships in the bundle,
   so the names are public today and `noindex` only stops Google.
2. **Retire `format_motion`?** 2 tags, 0 refs, and the classifier already skips the axis.
   Opt-in delete block is drafted in the migration and does not run.
3. **Is single-select still the right instruction?** It was a scope decision, not a finding about
   images, and it is now one editable sentence. An image genuinely carrying two palette
   treatments cannot say so. Changing it changes what every co-occurrence figure means.
4. **Fix the Signature block's framing** on `/curator/[name]` — it says it shows "the tags a
   curator pulls toward and away from", but curators do not apply tags. It measures what Claude
   tagged the images each curator *chose*. Live surface, false premise.
5. Gitignore `Claude outputs/` — the desktop app is dropping files into the repo root.

---

## First move in the new window

Re-derive the board and drift with `execute_sql` and snapshot them. Everything in step 1.10
depends on having that baseline before anything changes.
