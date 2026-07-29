@AGENTS.md

<!-- The import above pulls in AGENTS.md, which warns that this Next.js version (16.2.12, confirmed in package.json) has real breaking changes since older training data. Read node_modules/next/dist/docs/ before writing App Router code — don't assume pre-2026 Next.js conventions still apply. -->

# CLAUDE.md — Gradient project context

This file is read automatically by Claude Code at the start of every session in this repo. It exists so you never have to re-explain the project from scratch. Full docs live outside this repo — `gradient-build-plan.md` (the 3-month plan) and `gradient-visual-brief.md` (the locked identity system) — bring their relevant sections in as needed, this file is the always-loaded summary.

## What Gradient is

Gradient pairs visual inspiration with real conviction. It feels like scrolling Cosmos — a visual, idea-sparking grid of real design work — except every piece carries a real number: how fast this aesthetic is actually moving, and whether it's worth designing a campaign or making a creative bet around. Positioning: "Bloomberg Terminal for creatives" — Cosmos/Savee/Pinterest give inspiration with no signal; WGSN gives real data but as enterprise reporting most agencies can't reach; Stills gives a taste of both once a year in a static PDF. Gradient is the living, scrollable, current middle: real trend data paired with real visual inspiration, priced and built for agencies and studios locked out of WGSN.

Daniela personally curates the reference library (clipping real design work from Behance, Dribbble, agency sites, awards archives, Instagram) — this is not user-generated content or autonomous scraping. AI classifies what gets clipped and computes trend velocity from how tags shift over time.

## Current phase

Phase 0 — Foundations (Week 1 of the 12-week plan). Tech stack is locked (below), and the Next.js app is scaffolded (Next 16.2.12, React 19.2.4, Tailwind v4, TypeScript, App Router). Taxonomy and the confidence-display threshold are still open — see "Open decisions" below; don't build features that assume they're already decided.

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

Direction name: "Two bodies, one cut." One hard-cut, dual-body mark used identically on every surface (no separate soft "bloom" version — that was tried and dropped). Below 32px the dim body can drop out, leaving a single disc.

**Palette (use these hex values exactly, everywhere):**

| Name | Hex | Role |
|---|---|---|
| Ink | `#0B0A0E` | Base surface |
| Bone | `#E7E3D8` | Text, dim mark body, all small-scale numbers/labels |
| Slate | `#5C6B87` | Fading state — large numerals + mark's bright body only |
| Oxide | `#B4453A` | Accelerating state — large numerals + mark's bright body only |

**Typography**: wordmark is "Gradient" (capitalized), Archivo weight 600, grotesk throughout. Bold/larger cut for wordmark, trend names, and headlines; quiet regular cut for every stat, label, and confidence note. Never a serif. Bold weight never touches a number.

**Hard production rules**:
- One mark, one hard-cut form, everywhere — no soft variant to choose between.
- Dark scrim behind any color-coded element sitting on photography (Oxide/Slate both lose legibility on warm or blue-grey imagery without one).
- Oxide/Slate never as small-scale text — both measure ~3.6:1 contrast against Ink, which clears large text (24px+) but fails the 4.5:1 minimum smaller text needs. Small labels/numbers render in Bone; color lives only in the mark's bright body.
- Confidence/sample-size note at nav-text size, its own ruled line, never undersized as fine print.

## Open decisions — do not assume these are settled

- **Seed taxonomy**: 15–25 categories (aesthetic movements, typography styles, color palette types, layout patterns) — not yet drafted. This is Daniela's task, not an engineering one; don't invent categories in code that presuppose a taxonomy that hasn't been written yet.
- **Confidence-display threshold**: the reference-count cutoff between "Early Signal" and a full stat display — not yet decided.
- **Cosmic-feel gut-check**: worth watching whether the fully hard-edged mark (no soft bloom) still carries the brand's "cosmic" register once more screens are built, or whether that needs to come from photography/motion/copy instead. Not a blocker, just a watch item.

## Legal note (practical starting point, not legal advice)

Personal clipping library stays private/internal while seeding (Phase 1–2) — low risk. For anything shown publicly later, use cropped/low-res thumbnails with visible source attribution and a link back; this is closer to fair-use commentary than to Pinterest/Cosmos-style DMCA-protected UGC, since the library isn't independently user-uploaded. Get a paid legal consult before charging money for the product (Phase 5), not before.

## Working conventions

- Work phase-by-phase — one concrete, scoped task per session, not "build the whole app."
- Commit often, in small working increments.
- Keep a running decisions log for taxonomy changes and velocity-formula tweaks.
- Review and click through every feature yourself before moving to the next one.
