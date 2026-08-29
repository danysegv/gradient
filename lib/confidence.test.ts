import { test } from "node:test";
import assert from "node:assert/strict";
import { getConfidence } from "./confidence.ts";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

// A tag that has cleared every pre-existing gate: plenty of references,
// old enough for the 45-day gate, referenced recently.
const CLEARED = {
  referenceCount: 45,
  earliestReferenceAt: daysAgo(46),
  latestReferenceAt: daysAgo(1),
  velocity: -0.0336,
  now: NOW,
};

test("omitting the panel flag preserves the pre-2026-08-28 behaviour exactly", () => {
  const state = getConfidence(CLEARED);
  assert.equal(state.band, "full-stat");
  assert.equal(state.velocity, -0.0336);
  assert.equal(state.label, null);
  assert.equal(state.panelSkew, false);
});

test("an unsafe panel withholds the number on a tag that cleared every other gate", () => {
  const state = getConfidence({ ...CLEARED, panelSafeForGlobalVelocity: false });
  assert.equal(state.band, "full-stat", "the band itself is unchanged");
  assert.equal(state.referenceCount, 45, "the count is still true and shown");
  assert.equal(state.velocity, null, "but the number is withheld");
  assert.equal(state.panelSkew, true);
  assert.equal(state.label, "Panel Skew");
});

test("an explicitly safe panel behaves as if the flag were absent", () => {
  const state = getConfidence({ ...CLEARED, panelSafeForGlobalVelocity: true });
  assert.equal(state.velocity, -0.0336);
  assert.equal(state.panelSkew, false);
  assert.equal(state.label, null);
});

test("Cooling takes precedence over Panel Skew", () => {
  // Stale for 30+ days AND an unsafe panel. Cooling is the truer thing to
  // say: nobody has referenced this at all, whoever was clipping.
  const state = getConfidence({
    ...CLEARED,
    latestReferenceAt: daysAgo(31),
    panelSafeForGlobalVelocity: false,
  });
  assert.equal(state.cooling, true);
  assert.equal(state.label, "Cooling");
  assert.equal(state.panelSkew, false, "not double-flagged");
  assert.equal(state.velocity, null);
});

test("Early Signal takes precedence over Panel Skew", () => {
  // Under the count band. It is early, not skewed — the panel question
  // never arises because no number was going to show anyway.
  const state = getConfidence({
    ...CLEARED,
    referenceCount: 9,
    panelSafeForGlobalVelocity: false,
  });
  assert.equal(state.band, "early-signal");
  assert.equal(state.label, "Early Signal");
  assert.equal(state.panelSkew, false);
  assert.equal(state.velocity, null);
});

test("a tag inside the 45-day age gate still reads Early Signal, panel or no panel", () => {
  const state = getConfidence({
    ...CLEARED,
    earliestReferenceAt: daysAgo(44),
    panelSafeForGlobalVelocity: false,
  });
  assert.equal(state.band, "early-signal");
  assert.equal(state.label, "Early Signal");
});

test("the 45-day age gate boundary is inclusive", () => {
  assert.equal(
    getConfidence({ ...CLEARED, earliestReferenceAt: daysAgo(45) }).band,
    "full-stat"
  );
  assert.equal(
    getConfidence({ ...CLEARED, earliestReferenceAt: daysAgo(44.9) }).band,
    "early-signal"
  );
});

test("the count bands sit where the locked spec says they do", () => {
  const at = (n: number) =>
    getConfidence({ ...CLEARED, referenceCount: n }).band;
  assert.equal(at(14), "early-signal");
  assert.equal(at(15), "velocity");
  assert.equal(at(40), "velocity");
  assert.equal(at(41), "full-stat");
});

test("a null velocity is never fabricated, whatever the gates say", () => {
  const state = getConfidence({ ...CLEARED, velocity: null });
  assert.equal(state.velocity, null);
  assert.equal(state.label, null, "no number is not the same as a warning");
});
