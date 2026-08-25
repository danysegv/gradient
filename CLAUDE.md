@AGENTS.md

<!-- The import above pulls in AGENTS.md, which warns that this Next.js version (16.2.12, confirmed in package.json) has real breaking changes since older training data. Read node_modules/next/dist/docs/ before writing App Router code — don't assume pre-2026 Next.js conventions still apply. -->

# CLAUDE.md — 04AM project context

This file is read automatically by Claude Code at the start of every session in this repo. It exists so you never have to re-explain the project from scratch. Full docs live outside this repo — `gradient-build-plan.md` (the 3-month plan), `gradient-visual-brief.md` (the locked identity system), and `04am-taxonomy.md` (the locked seed taxonomy) — bring their relevant sections in as needed, this file is the always-loaded summary. (Renamed 2026-08-23: the in-repo taxonomy is now `04am-taxonomy.md`. `gradient-build-plan.md` and `gradient-visual-brief.md` live outside this repo and still carry the old filenames — rename them at the source when convenient.)

## What 04AM is

04AM pairs visual inspiration with real conviction. It feels like scrolling Cosmos — a visual, idea-sparking grid of real design work — except every piece carries a real number: how fast this aesthetic is actually moving, and whether it's worth designing a campaign or making a creative bet around. Positioning: "Bloomberg Terminal for creatives" — Cosmos/Savee/Pinterest give inspiration with no signal; WGSN gives real data but as enterprise reporting most agencies can't reach; Stills gives a taste of both once a year in a static PDF. 04AM is the living, scrollable, current middle: real trend data paired with real visual inspiration, priced and built for agencies and studios locked out of WGSN.

Daniela personally curates the reference library (clipping real design work from Behance, Dribbble, agency sites, awards archives, Instagram) — this is not user-generated content or autonomous scraping. AI classifies what gets clipped and computes trend velocity from how tags shift over time.

## Current phase

Phase 1 — Data foundation, Signals Feed live. Phase 0 is complete: tech stack locked, Next.js app scaffolded (Next 16.2.12, React 19.2.4, Tailwind v4, TypeScript, App Router), repo pushed to GitHub, deployed live on Vercel (`https://gradient-flax.vercel.app`), Supabase wired up in both production and local dev. The seed taxonomy is locked (see below and `04am-taxonomy.md`), the database schema is built and seeded, the clipper + AI classification pipeline are live, and the Signals Feed homepage (`/`) is built — the first real product screen, pulling live from `clips`/`clip_tags`/`tags` through the anon key. The confidence-display bands are locked (see below); the 15/40 count cutoffs and the 45-day age gate are starting points, not derived from data.

## Database schema (locked, Phase 1)

Three tables, live in the Supabase project referenced above:

- **`tags`** — the 21 seed taxonomy entries. Columns: `id`, `"group"` (enum: `movement` / `typography` / `palette_light` / `layout` / `format_motion` / `treatment`), `editorial_name` (unique, e.g. "Zinepunk" — the primary display label), `universal_term` (secondary label, e.g. "Grunge"), `description`.
- **`clips`** — each personally-curated reference. Columns: `id`, `url`, `image_url`, `title`, `source`, `caption`, `clipped_at`, `created_at`, `archived_at` (timestamptz, nullable — soft delete, added 2026-08-21; see decisions log), `clipped_by_name` (text, nullable — the curator's name, set at insert since 2026-08-25; see decisions log), `clipped_by` (uuid, nullable — **dead residue from the reverted Supabase-Auth experiment, leave it, don't drop it, don't use it**). `archived_by_name` (text, nullable) is a drafted-but-not-yet-applied migration — see the 2026-08-25 decisions-log entry; `app/clip/archive-actions.ts` already writes to it, so archiving will error with "column does not exist" until the migration is applied. (Named `clips`, not `references` — that's a reserved SQL word.)
- **`clip_tags`** — the many-to-many join. A single clip can carry a tag from every axis at once (this is a faceted system, not single-category). Columns: `clip_id`, `tag_id`, `confidence` (0–1, nullable), `created_at`, composite primary key `(clip_id, tag_id)`.

RLS is enabled on all three tables. Anon `SELECT`-only policies were added 2026-08-21 when the Signals Feed homepage shipped (`anon read clips` / `anon read clip_tags` / `anon read tags`, all `qual: true`) — this is what the public homepage reads through (`lib/supabase/public.ts`, the anon/publishable key). No `INSERT`/`UPDATE`/`DELETE` policy exists for anon, by design — writes still go through server routes using the service-role key, and that now includes archiving: `archived_at` is only ever set via `app/clip/archive-actions.ts`, which uses `supabaseAdmin` and is gated by the same clip password session as the rest of `/clip`. There's also a `tag_clip_counts` view (`tag_id, group, editorial_name, universal_term, clip_count, earliest_reference_at, latest_reference_at`) that both the Signals Feed and the internal diagnostic queries read from — extend this view, don't duplicate its aggregation logic, if something else needs per-tag counts or dates. The view excludes archived clips from every aggregate (pre-filters `clip_tags` joined to `clips` in a subquery before the `LEFT JOIN`, rather than filtering after — a plain post-join `WHERE archived_at is null` would silently drop any tag whose only references just got archived, since nothing would be left to `GROUP BY`). Every read path (`app/page.tsx`, `app/clip/page.tsx`, `lib/clips/unclassified.ts`) filters `.is("archived_at", null)`. Note: leftover `authenticated`-role policies from an abandoned Supabase-Auth magic-link experiment (since reverted to the password gate) are still sitting in the DB, unused but harmless — clean up if they ever get confusing.

## V1 scope — build these

- Personal clipper (private intake tool, paste-a-URL to start — not a public feature)
- AI classification pipeline (tags each clipped item against the seed taxonomy)
- Trend velocity computation (usage/frequency change over time, per tag)
- Confidence indicator (sample size + recency shown alongside every stat — core to the pitch, not a polish item)
- Signals Feed homepage (visual grid, hover reveals stat + confidence)
- Trend detail pages (full stats, confidence detail, related-references grid)
- Near-term trend forecasting (momentum-based, honestly scoped to what a young dataset supports)
- Trend Radar (interactive quadrant map)
- Visual Genome (aesthetic breakdown, reuses the tagging system)
- Closed beta + waitlist landing page

## Explicitly deferred — do not build yet

- Talent Radar
- Pro/Enterprise tiers, billing
- Open/public contribution or UGC
- Native mobile app

## Tech stack (locked)

- **Frontend**: Next.js 16.2.12, React 19.2.4, App Router, TypeScript, Tailwind v4
- **Hosting**: Vercel (Hobby plan to start) — not connected yet
- **Database**: Postgres via Supabase — project already provisioned, see below
- **Extra image storage**: Cloudflare R2 (only once Supabase's 1GB storage cap is outgrown)
- **AI classification**: Claude API (vision-capable calls)
- **Clipper tool (v1)**: a simple "paste a URL" web form inside the Next.js app — no browser extension yet

### Supabase project (already provisioned)

- Project ref: `faxdpkqkufbywoxfmnka`
- Project URL: `https://faxdpkqkufbywoxfmnka.supabase.co`
- Organization: Gradiente
- Status: active, empty (no tables yet — schema is Phase 1 work: a `references` table and a `tags` table)
- Publishable (anon) key: safe to use client-side, pull fresh via Supabase MCP or the dashboard rather than hardcoding — do not commit service-role keys to this repo, ever

## Identity system (locked — see gradient-visual-brief.md for full detail)

The mark is a single fused wordmark — one hard-cut path, letterforms fused together, used identically on every surface (no separate soft "bloom" version — that was tried and dropped). **Correction, 2026-08-24: there is no separate icon/symbol mark.** An earlier "Two bodies, one cut" dual-body-icon direction (with a droppable dim body below 32px, collapsing to a single disc) was tried and abandoned — don't resurrect that framing if it resurfaces in old notes.

Wired into code as of the Signals Feed build (2026-08-21): `app/globals.css` defines `--ink`/`--bone`/`--slate`/`--oxide` as Tailwind theme colors (`bg-ink`, `text-bone`, etc.); `app/layout.tsx` loads Archivo as the sans font; `components/wordmark.tsx` holds the wordmark SVG as `<Wordmark />` — reuse this component, don't re-derive the path. Currently on the "tighter-fusion cut" traced 2026-08-24 (`04am-wordmark-tight.svg`, viewBox `0 0 2691 846`); pull path + viewBox verbatim from source files like that one whenever the mark changes again, never re-trace by hand — and preserve `fill-rule="evenodd"` on the path, it's what punches the letterform counters. `--ink-2` (`#131218`) also exists as a card/surface tone — not a fifth brand color, just a near-black variant of Ink for distinguishing raised surfaces from the page background.

**Palette (use these hex values exactly, everywhere):**

| Name | Hex | Role |
|---|---|---|
| Ink | `#0B0A0E` | Base surface |
| Bone | `#E7E3D8` | Text, dim mark body, all small-scale numbers/labels |
| Slate | `#5C6B87` | Fading state — large numerals + mark's bright body only |
| Oxide | `#B4453A` | Accelerating state — large numerals + mark's bright body only |

**Typography**: wordmark is "04AM", Archivo weight 600, grotesk throughout. Bold/larger cut for wordmark, trend names, and headlines; quiet regular cut for every stat, label, and confidence note. Never a serif. Bold weight never touches a number.

**Hard production rules**:
- One mark, one hard-cut form, everywhere — no soft variant to choose between.
- Dark scrim behind any color-coded element sitting on photography (Oxide/Slate both lose legibility on warm or blue-grey imagery without one).
- Oxide/Slate never as small-scale text — both measure ~3.6:1 contrast against Ink, which clears large text (24px+) but fails the 4.5:1 minimum smaller text needs. Small labels/numbers render in Bone; color lives only in the mark's bright body.
- Confidence/sample-size note at nav-text size, its own ruled line, never undersized as fine print.

## Confidence display (locked)

Every trend stat is gated by how much data sits behind it. Three bands, by reference count for that tag:

- **Under 15 references** — no velocity number at all. Show the tag, the count, and the label **"Early Signal."** Treat this as a legitimate, interesting state, not a failure state or an empty slot: "surfacing but too new to measure" is real value to a creative director, and at launch most tags will sit here. Never pad it, never hide it, never fake a number to fill the space.
- **15–40 references** — show the velocity figure, always accompanied by the reference count, so it never reads as settled.
- **Over 40 references** — full stat display. The confidence note stays visible; it just stops being a caveat and becomes evidence.

Independent of the bands, any tag with **no new references in 30 days** is flagged **"Cooling"** and rendered in Slate regardless of total count — this is what stops a large historical pile from reading as a live signal.

**Addition, 2026-08-21 (`lib/confidence.ts`): velocity is also gated on calendar age, not just count.** A tag can only clear the 15/40 count bands if its *earliest* reference is at least ~45 days old — otherwise it renders Early Signal regardless of how many references it has. Reasoning: a velocity number computed from an 11-day-old tag is a real number wearing a fake confidence, even if the raw count already cleared 15 or 40. This is why, at Signals Feed launch, every tag reads Early Signal — including several already well past 15 references (BoldGrotesk, RawAsymmetry, HighEnergy, FrontalSymmetry, AnalogNoise all had 20–31 references at ~11 days old and still correctly read Early Signal). The age gate is a starting point like the count cutoffs, not derived from data — revisit together. The 45-day figure predates the velocity formula below and is now a fixed threshold in its own right, not literally "half" of whatever window velocity happens to use — see the 2026-08-24 decisions-log entry for why those two numbers decoupled.

Implementation note: `getConfidence()` never fabricates a velocity figure. The function accepts an optional precomputed `velocity` and only surfaces it once both gates clear and the tag isn't cooling; the formula that produces that number lives in `lib/velocity.ts` (see decisions log, 2026-08-24) and returns `null` — never an invented or extrapolated figure — whenever the data can't support one, in which case the UI shows the reference count instead.

Rendering rules for these cards follow the identity system exactly: color (Oxide/Slate) only on the large numerals, all small text and labels in Bone, and the confidence note on its own ruled line at nav-text size — never shrunk to fine print. One exception, called out explicitly in the spec above: the "Cooling" label itself renders in Slate even though it's small-scale text — everything else in this section (raw counts, "Early Signal") stays Bone.

## Format & Motion scope (locked)

MotionLoop and StoryScroll stay in the `tags` table, but the **AI classifier skips the `format_motion` group entirely in v1** — those two are applied by hand at clip time. This keeps video/scroll capture out of the Phase 1 clipper scope without requiring a taxonomy migration later. Consequence: those two tags will carry thinner data than the rest for a while, which the confidence bands surface honestly rather than hide.

## Open decisions — do not assume these are settled

- **Cosmic-feel gut-check**: worth watching whether the fully hard-edged mark (no soft bloom) still carries the brand's "cosmic" register once more screens are built, or whether that needs to come from photography/motion/copy instead. Not a blocker, just a watch item.

## Decisions log

- **2026-08-21 — Soft delete + Cosmos-style masonry grids.** Clips are archivable (`clips.archived_at`, nullable timestamp, not a boolean, so the value itself records *when*). Archiving is reversible by design: single click, no confirmation modal, brief undo affordance instead. Both `/` and `/clip` moved from bordered-card lists to edge-to-edge masonry grids (`columns-2 sm:columns-3 md:columns-4 lg:columns-5`, natural aspect ratios via `ClipThumbnail`, metadata on hover) — this is the "Cosmos-style" visual-grid direction referenced throughout this file. The homepage grid adds tag filter chips (grouped by axis, multi-select ANDs together). The clipper grid keeps its bad-`image_url`/needs-image warnings always visible (not hover-gated) since spotting those is the clipper's whole job.
- **2026-08-25 — Named curator secrets, still not user accounts.** `lib/clip-auth.ts`. The `/clip` gate stays a shared-secret gate — no Supabase Auth, no magic links; that was tried twice and fully reverted (see the `clipped_by` uuid residue in the schema section above). What changed: `CLIP_GATE_SECRET` (one anonymous secret) is now `CLIP_CURATORS`, a `name:secret,name:secret` list parsed once per process. `resolveCurator()` compares a submitted password against every curator's secret unconditionally — the loop never returns early on a match — so the total time doesn't depend on which curator (or whether any) matched; each individual comparison still uses `timingSafeEqual`, unchanged from before. The session cookie carries `<name>.<hash>`, where the hash is derived from that curator's own secret (never the secret itself, and the name is bound into the hash input so a token can't be revalidated against a different curator's secret). This is what makes rotation safe: rotating curator A's secret only changes what hash A's cookie needs to match — curator B's cookie is verified independently against B's unchanged secret, so B stays signed in. `CLIP_GATE_SECRET` still works as a fallback (mapped to a single placeholder curator named `"curator"`) whenever `CLIP_CURATORS` is unset, purely so switching env vars in Vercel/locally can't cause a mid-deploy lockout — not meant for daily use once real curators are configured. `clips.clipped_by_name` (already existed, backfilled 2026-08-25-or-earlier with 101 `danysegv` / 4 `lumalhaes`) is now actually written, by `app/clip/actions.ts` at insert. `clips.archived_by_name` (text, nullable) is a **drafted migration, not yet applied** — `app/clip/archive-actions.ts` already sets it (and clears it on restore, paired with `archived_at`), so archiving will error until the migration runs. Curator names are deliberately confined to the password-gated `/clip` route: `app/page.tsx`'s queries and `components/home-grid.tsx`'s `GridClip` type must never select `clipped_by_name`/`archived_by_name` — an RSC payload ships to the browser even for fields a component doesn't render, so "don't render it" isn't sufficient, only "don't select it" is.
- **2026-08-24 — Velocity formula: recent-share vs all-time-share, not a 90-day growth rate.** `lib/velocity.ts`. Two more literal readings of "trailing 90-day window" were considered and rejected on a data-reality basis, not a style preference: (1) recent-90d-count vs prior-90d-count (growth rate), and (2) tag's share of all clips now vs its share 90 days ago. Both compare against a symmetric "before" period, which is structurally empty until the library itself is 90–180 days old — the library's first-ever reference is 2026-08-10, so both would still return `null` on 2026-11-08 at the earliest, over a month after the 45-day age gate opens (2026-09-24, when BoldGrotesk/RawAsymmetry/AnalogNoise/HighEnergy/FrontalSymmetry clear it). A plain "references per week" rate was also considered and rejected for a different reason: clipping cadence is bursty (single days of 30–60+ references against otherwise-zero days), so a rate spikes on whichever day you had a free afternoon — it measures the clipping calendar, not the trend. The formula that shipped: `recentShare` (tag's references in the trailing 30 days ÷ every tag's references in the trailing 30 days) minus `baseShare` (tag's references all-time ÷ every tag's references all-time), in percentage points. Numerator and denominator of each share come from the same window, so a heavy clipping day inflates both and cancels out — it only moves a tag's velocity if that day was disproportionately about that tag, which is real signal. Returns `null` (never fabricated) when the trailing-30-day window has fewer than 30 tag-applications library-wide (`MIN_RECENT_WINDOW_VOLUME` — a single reference would swing any tag's share by more than ~3 points on its own below that) or when the all-time set is empty. Source data is `clip_tags.created_at` joined through `clips` excluding `archived_at is not null`, matching `tag_clip_counts` exactly so the two can't disagree. Both the 30-day recent window and the 30-reference floor are starting points, not derived from data — revisit alongside the 15/40 count bands and the 45-day age gate. Consequence for display copy: the "· 90d" suffix on the trend cards is now "· 30d", since that's the window the number is actually keyed to (the 45-day age-gate threshold above it is unchanged and no longer tied to "half of 90").

## Legal note (practical starting point, not legal advice)

Personal clipping library stays private/internal while seeding (Phase 1–2) — low risk. For anything shown publicly later, use cropped/low-res thumbnails with visible source attribution and a link back; this is closer to fair-use commentary than to Pinterest/Cosmos-style DMCA-protected UGC, since the library isn't independently user-uploaded. Get a paid legal consult before charging money for the product (Phase 5), not before.

## Working conventions

- Work phase-by-phase — one concrete, scoped task per session, not "build the whole app."
- Commit often, in small working increments.
- Keep a running decisions log for taxonomy changes and velocity-formula tweaks.
- Review and click through every feature yourself before moving to the next one.
