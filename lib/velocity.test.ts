import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTagVelocity, computeVelocitiesForTags } from "./velocity.ts";

const NOW = new Date("2026-09-24T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

// Build N reference dates spread evenly across [fromDaysAgo, toDaysAgo].
function spread(count: number, fromDaysAgo: number, toDaysAgo: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgoValue =
      count === 1 ? fromDaysAgo : fromDaysAgo + ((toDaysAgo - fromDaysAgo) * i) / (count - 1);
    dates.push(daysAgo(daysAgoValue));
  }
  return dates;
}

test("returns null when all-time reference set is empty (division by zero)", () => {
  const result = computeTagVelocity({
    tagReferenceDates: [],
    allReferenceDates: [],
    now: NOW,
  });
  assert.equal(result, null);
});

test("returns null when the recent-window library-wide volume is below the noise floor", () => {
  // Only 10 tag-applications library-wide in the last 30 days, even
  // though there's plenty of all-time history — too thin to trust.
  const allReferenceDates = [...spread(10, 20, 0), ...spread(50, 80, 40)];
  const tagReferenceDates = spread(5, 20, 0);

  const result = computeTagVelocity({
    tagReferenceDates,
    allReferenceDates,
    now: NOW,
  });
  assert.equal(result, null);
});

test("computes a positive share shift when a tag is over-represented recently", () => {
  // Library-wide: 40 refs in the last 30 days (clears the 30-ref floor),
  // 100 refs all-time. This tag: 20 of the recent 40, 25 of the all-time 100.
  // The "older" group stays at 35+ days ago, clear of the 30-day cutoff.
  const allReferenceDates = [...spread(40, 25, 0), ...spread(60, 90, 35)];
  const tagReferenceDates = [...spread(20, 25, 0), ...spread(5, 90, 35)];

  const result = computeTagVelocity({
    tagReferenceDates,
    allReferenceDates,
    now: NOW,
  });

  assert.ok(result !== null);
  // recentShare = 20/40 = 0.5, baseShare = 25/100 = 0.25
  assert.ok(Math.abs(result! - 0.25) < 1e-9, `expected ~0.25, got ${result}`);
});

test("a tag with references only in the older window returns a real negative number, not null", () => {
  // This tag has 25 all-time references, all older than the 30-day
  // recent window, and zero in the recent window. Library-wide recent
  // volume still clears the floor (from other tags), so this isn't a
  // null case — it's a real "this tag went quiet" signal.
  const allReferenceDates = [...spread(40, 25, 0), ...spread(85, 90, 40)];
  const tagReferenceDates = spread(25, 90, 40);

  const result = computeTagVelocity({
    tagReferenceDates,
    allReferenceDates,
    now: NOW,
  });

  assert.ok(result !== null);
  // recentShare = 0/40 = 0, baseShare = 25/125 = 0.2 -> velocity = -0.2
  assert.ok(Math.abs(result! - -0.2) < 1e-9, `expected ~-0.2, got ${result}`);
});

test("a reference exactly at the 30-day cutoff counts as recent (inclusive boundary)", () => {
  const boundary = daysAgo(30);
  const allReferenceDates = [...spread(29, 29, 0), boundary, ...spread(50, 90, 40)];
  const tagReferenceDates = [boundary];

  const result = computeTagVelocity({
    tagReferenceDates,
    allReferenceDates,
    now: NOW,
  });

  assert.ok(result !== null);
  // recentShare = 1/30, baseShare = 1/80
  const expected = 1 / 30 - 1 / 80;
  assert.ok(Math.abs(result! - expected) < 1e-9, `expected ~${expected}, got ${result}`);
});

test("string ISO dates work the same as Date objects", () => {
  const allReferenceDates = [
    ...spread(35, 20, 0).map((d) => d.toISOString()),
    ...spread(65, 90, 40).map((d) => d.toISOString()),
  ];
  const tagReferenceDates = spread(10, 20, 0).map((d) => d.toISOString());

  const result = computeTagVelocity({ tagReferenceDates, allReferenceDates, now: NOW });
  assert.ok(result !== null);
});

test("computeVelocitiesForTags batches multiple tags off one shared row list", () => {
  const rows = [
    ...spread(20, 25, 0).map((createdAt) => ({ tagId: "a", createdAt })),
    ...spread(20, 25, 0).map((createdAt) => ({ tagId: "b", createdAt })),
    ...spread(60, 90, 26).map((createdAt) => ({ tagId: "c", createdAt })),
  ];

  const velocities = computeVelocitiesForTags(rows, NOW);

  assert.equal(velocities.size, 3);
  // Recent library-wide volume = 40 (clears floor). Tag a and b each hold
  // 20/40 recent share, 20/100 all-time share -> same positive velocity.
  assert.ok(velocities.get("a") !== null);
  assert.equal(velocities.get("a"), velocities.get("b"));
  // Tag c has zero recent references -> negative velocity, not null.
  assert.ok(velocities.get("c")! < 0);
});
