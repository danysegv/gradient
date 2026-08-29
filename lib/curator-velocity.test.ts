import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeVelocitiesForCurator,
  computePanelComposition,
  computeBalancedVelocities,
  MAX_PANEL_DRIFT,
  type CuratorRow,
} from "./curator-velocity.ts";
import { computeVelocitiesForTags } from "./velocity.ts";

const NOW = new Date("2026-09-24T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

// n rows for one curator on one tag, all at the same age.
function rows(
  curator: string | null,
  tagId: string,
  n: number,
  ageDays: number
): CuratorRow[] {
  return Array.from({ length: n }, () => ({
    curator,
    tagId,
    createdAt: daysAgo(ageDays),
  }));
}

const RECENT = 10; // inside the trailing 30-day window
const OLD = 60; // outside it

// ---------------------------------------------------------------------
// Panel composition — the gate
// ---------------------------------------------------------------------

test("drift is zero for a one-person panel, however lopsided the window", () => {
  const panel = computePanelComposition(
    [...rows("dany", "a", 100, OLD), ...rows("dany", "b", 100, RECENT)],
    NOW
  );
  assert.equal(panel.curatorCount, 1);
  assert.equal(panel.drift, 0);
  assert.equal(panel.maxRecentShare, 1);
  // One curator cannot change the panel's composition. The gate must not
  // fire here, which is why drift is the metric and max-share is not.
  assert.equal(panel.safeForGlobalVelocity, true);
});

test("drift is zero when a dominant curator is dominant consistently", () => {
  const panel = computePanelComposition(
    [
      ...rows("dany", "a", 70, OLD),
      ...rows("luma", "a", 30, OLD),
      ...rows("dany", "a", 70, RECENT),
      ...rows("luma", "a", 30, RECENT),
    ],
    NOW
  );
  assert.equal(panel.curatorCount, 2);
  assert.ok(panel.drift < 1e-9, "stable mix should not read as drift");
  assert.equal(panel.safeForGlobalVelocity, true);
});

test("a newcomer surge drives drift up and closes the gate", () => {
  // Base is 2:1 Daniela. The window is 2:1 Luma. That is the 2026-08-27
  // situation in miniature.
  const panel = computePanelComposition(
    [
      ...rows("dany", "a", 160, OLD),
      ...rows("luma", "a", 20, OLD),
      ...rows("dany", "a", 40, RECENT),
      ...rows("luma", "a", 80, RECENT),
    ],
    NOW
  );
  assert.equal(panel.curatorCount, 2);
  assert.ok(panel.drift > MAX_PANEL_DRIFT, "expected drift above the gate");
  assert.equal(panel.safeForGlobalVelocity, false);
  assert.equal(panel.dominantCurator, "luma");
  assert.ok(Math.abs(panel.maxRecentShare - 80 / 120) < 1e-9);
});

test("unattributed rows are ignored rather than counted as a curator", () => {
  const panel = computePanelComposition(
    [
      ...rows("dany", "a", 50, OLD),
      ...rows(null, "a", 50, RECENT),
      ...rows("dany", "a", 50, RECENT),
    ],
    NOW
  );
  assert.equal(panel.curatorCount, 1);
  assert.equal(panel.baseTotal, 100);
  assert.equal(panel.recentTotal, 50);
});

test("an empty library does not divide by zero", () => {
  const panel = computePanelComposition([], NOW);
  assert.equal(panel.curatorCount, 0);
  assert.equal(panel.drift, 0);
  assert.equal(panel.dominantCurator, null);
  assert.equal(panel.safeForGlobalVelocity, true);
});

// ---------------------------------------------------------------------
// Per-curator velocity
// ---------------------------------------------------------------------

test("a curator's velocity is computed against their own history only", () => {
  // Luma's clipping is loud and entirely on tag b. It must not touch
  // Daniela's read at all.
  const library: CuratorRow[] = [
    ...rows("dany", "a", 30, OLD),
    ...rows("dany", "b", 30, OLD),
    ...rows("dany", "a", 30, RECENT),
    ...rows("dany", "b", 10, RECENT),
    ...rows("luma", "b", 500, RECENT),
  ];

  const dany = computeVelocitiesForCurator(library, "dany", NOW);
  // Daniela: tag a is 60/100 all-time, 30/40 recent -> +15 points.
  assert.ok(Math.abs(dany.get("a")! - (30 / 40 - 60 / 100)) < 1e-9);
  // and tag b is 40/100 all-time, 10/40 recent -> -15 points.
  assert.ok(Math.abs(dany.get("b")! - (10 / 40 - 40 / 100)) < 1e-9);
});

test("a curator with too little recent activity of their own returns null", () => {
  const library: CuratorRow[] = [
    ...rows("dany", "a", 100, OLD),
    ...rows("dany", "a", 5, RECENT), // below MIN_RECENT_WINDOW_VOLUME
  ];
  const dany = computeVelocitiesForCurator(library, "dany", NOW);
  assert.equal(dany.get("a"), null);
});

test("an unknown curator yields an empty map, not a throw", () => {
  const result = computeVelocitiesForCurator(
    rows("dany", "a", 50, RECENT),
    "nobody",
    NOW
  );
  assert.equal(result.size, 0);
});

// ---------------------------------------------------------------------
// Curator-balanced velocity
// ---------------------------------------------------------------------

test("balanced velocity is null while fewer than two curators qualify", () => {
  const library: CuratorRow[] = [
    ...rows("dany", "a", 100, OLD),
    ...rows("dany", "a", 50, RECENT),
    // Luma is present but has nowhere near enough of her own history.
    ...rows("luma", "a", 5, RECENT),
  ];
  const balanced = computeBalancedVelocities(library, NOW);
  assert.equal(balanced.get("a"), null);
});

test("REGRESSION: balanced velocity survives the BoldGrotesk inversion", () => {
  // The shape of the real 2026-09-24 projection. Curator A is accelerating
  // on tag x against her own baseline; curator B barely clips it and
  // out-volumes her 2:1 in the window. Pooled reports a fall. It should not.
  const library: CuratorRow[] = [
    // A: 200 all-time (34 on x = 17%), 40 recent (10 on x = 25%) -> +8 pts
    ...rows("dany", "x", 24, OLD),
    ...rows("dany", "other", 136, OLD),
    ...rows("dany", "x", 10, RECENT),
    ...rows("dany", "other", 30, RECENT),
    // B: 100 all-time (6 on x = 6%), 80 recent (4 on x = 5%) -> -1 pt
    ...rows("luma", "x", 2, OLD),
    ...rows("luma", "other", 18, OLD),
    ...rows("luma", "x", 4, RECENT),
    ...rows("luma", "other", 76, RECENT),
  ];

  const pooled = computeVelocitiesForTags(
    library.map((r) => ({ tagId: r.tagId, createdAt: r.createdAt })),
    NOW
  );
  const balanced = computeBalancedVelocities(library, NOW);

  const pooledX = pooled.get("x")!;
  const balancedX = balanced.get("x")!;

  // Pooled: 14/120 - 40/300 = -1.67 points. It says the tag is cooling.
  assert.ok(Math.abs(pooledX - (14 / 120 - 40 / 300)) < 1e-9);
  assert.ok(pooledX < 0, "pooled should report a fall in this shape");

  // Balanced: mean(+0.08, -0.01) = +3.5 points. It says the tag is rising.
  assert.ok(Math.abs(balancedX - 0.035) < 1e-9);
  assert.ok(balancedX > 0, "balanced should report a rise in this shape");

  // The sign flip is the whole point of the module.
  assert.notEqual(Math.sign(pooledX), Math.sign(balancedX));
});

test("a tag a curator dropped entirely counts as a negative shift for them", () => {
  // If a curator stops clipping a tag, that has to pull the mean DOWN.
  // Skipping tags a curator did not touch recently would bias it upward.
  const library: CuratorRow[] = [
    ...rows("dany", "x", 40, OLD),
    ...rows("dany", "other", 40, OLD),
    ...rows("dany", "other", 40, RECENT), // dany dropped x entirely
    ...rows("luma", "x", 20, OLD),
    ...rows("luma", "other", 20, OLD),
    ...rows("luma", "x", 20, RECENT),
    ...rows("luma", "other", 20, RECENT), // luma unchanged
  ];
  const balanced = computeBalancedVelocities(library, NOW);
  // dany: 0/40 - 40/120 = -0.3333 ; luma: 20/40 - 40/80 = 0
  assert.ok(Math.abs(balanced.get("x")! - -1 / 6) < 1e-9);
  assert.ok(balanced.get("x")! < 0);
});

test("equal-weight means a louder curator does not outvote a quieter one", () => {
  // Same per-curator shifts, wildly different volumes. The result must be
  // identical to the balanced figure when volumes are equal.
  const lopsided: CuratorRow[] = [
    ...rows("dany", "x", 15, OLD),
    ...rows("dany", "other", 15, OLD),
    ...rows("dany", "x", 20, RECENT),
    ...rows("dany", "other", 10, RECENT),
    ...rows("luma", "x", 150, OLD),
    ...rows("luma", "other", 150, OLD),
    ...rows("luma", "x", 200, RECENT),
    ...rows("luma", "other", 100, RECENT),
  ];
  const balanced = computeBalancedVelocities(lopsided, NOW);
  // Both curators shifted identically. Note all-time INCLUDES the recent
  // rows, so the baseline is 35/60, not 15/30: 2/3 - 35/60 = +1/12.
  assert.ok(Math.abs(balanced.get("x")! - 1 / 12) < 1e-9);
  // The 10x volume difference must not show up in the result at all.
  assert.ok(balanced.get("x")! > 0);
});
