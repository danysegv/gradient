import { test } from "node:test";
import assert from "node:assert/strict";
import {
  foundViaFromUrl,
  isKnownFinder,
  knownFinderNames,
} from "./attribution.ts";

test("collapses the three spellings of PICDIT to one", () => {
  // "Design Inspiration", "PICDIT" and "PIC DIT" were three hand-typed
  // spellings of the same site across six clips. Keyed on the host they
  // cannot diverge again.
  for (const u of [
    "https://picdit.net/post/123",
    "https://www.picdit.net/",
    "http://picdit.net/x",
  ]) {
    assert.equal(foundViaFromUrl(u), "PICDIT");
  }
});

test("collapses AnOther Magazine's two casings", () => {
  assert.equal(
    foundViaFromUrl("https://www.anothermag.com/art-photography/123"),
    "AnOther Magazine"
  );
});

test("matches subdomains but not lookalike domains", () => {
  assert.equal(foundViaFromUrl("https://blog.iso50.com/x"), "ISO50 Blog");
  assert.equal(foundViaFromUrl("https://dk.pinterest.com/pin/1"), "Pinterest");
  // Must not match a domain that merely ENDS with the same letters.
  assert.equal(foundViaFromUrl("https://notpicdit.net/x"), null);
  assert.equal(foundViaFromUrl("https://fakeinstagram.com/x"), null);
});

test("returns null for a creator's own site rather than calling it a finder", () => {
  // These were real sources in the first 154 clips. Filing an artist's
  // own portfolio as "found via" would be false.
  for (const u of [
    "https://felixbell.com/work",
    "https://paulgacon.com/epoch",
    "https://norte.studio/hermes",
    "https://www.apdirector.com/",
  ]) {
    assert.equal(foundViaFromUrl(u), null);
  }
});

test("survives a malformed URL without throwing", () => {
  assert.equal(foundViaFromUrl("not a url"), null);
  assert.equal(foundViaFromUrl(""), null);
});

test("isKnownFinder agrees with foundViaFromUrl", () => {
  assert.equal(isKnownFinder("https://designspiration.com/x"), true);
  assert.equal(isKnownFinder("https://felixbell.com/x"), false);
});

test("finder names are unique and sorted", () => {
  const names = knownFinderNames();
  assert.deepEqual(names, [...new Set(names)]);
  assert.deepEqual(names, [...names].sort());
  assert.ok(names.includes("PICDIT"));
});

// --- attributionPatch: the never-overwrite rule -----------------------

import { attributionPatch, type AttributionFields } from "./attribution.ts";

const EMPTY: AttributionFields = {
  creator: null,
  rights_holder: null,
  found_via: null,
  source_year: null,
};

test("fills every field when the clip has none", () => {
  const patch = attributionPatch(EMPTY, {
    creator: "Eiko Ishioka",
    rights_holder: "Yasei Jidai",
    found_via: "Collectors Weekly",
    source_year: 1976,
  });
  assert.deepEqual(patch, {
    creator: "Eiko Ishioka",
    rights_holder: "Yasei Jidai",
    found_via: "Collectors Weekly",
    source_year: 1976,
  });
});

test("NEVER overwrites a credit a human already typed", () => {
  const human: AttributionFields = {
    creator: "Pierre Mendell",
    rights_holder: null,
    found_via: null,
    source_year: 1993,
  };
  const patch = attributionPatch(human, {
    creator: "Designspiration", // the exact wrong answer this guards against
    rights_holder: "Die Neue Sammlung",
    found_via: "Designspiration",
    source_year: 2026,
  });
  // Only the two empty fields move.
  assert.deepEqual(patch, {
    rights_holder: "Die Neue Sammlung",
    found_via: "Designspiration",
  });
  assert.ok(!("creator" in patch), "creator must be untouched");
  assert.ok(!("source_year" in patch), "source_year must be untouched");
});

test("a null inference never blanks an existing value", () => {
  const filled: AttributionFields = {
    creator: "Connor Willumsen",
    rights_holder: "Éditions çà et là",
    found_via: null,
    source_year: 2023,
  };
  assert.deepEqual(attributionPatch(filled, EMPTY), {});
});

test("returns an empty patch when there is nothing to add", () => {
  assert.deepEqual(attributionPatch(EMPTY, EMPTY), {});
  assert.deepEqual(attributionPatch(EMPTY, {}), {});
});

test("source_year 0 is not treated as absent", () => {
  // Guards against a truthiness check creeping in where a null check belongs.
  const patch = attributionPatch(EMPTY, { source_year: 0 });
  assert.deepEqual(patch, { source_year: 0 });
});

test("covers the aggregators that showed up in the real library", () => {
  assert.equal(foundViaFromUrl("https://designreviewed.com/x"), "Design Reviewed");
  assert.equal(foundViaFromUrl("https://visuelle.co.uk/x"), "Visuelle");
  assert.equal(foundViaFromUrl("https://eyecannndy.com/technique/x"), "Eye Cannndy");
  assert.equal(foundViaFromUrl("https://www.creativereview.co.uk/x"), "Creative Review");
  // Twitter's image CDN is still "found on X", not a creator.
  assert.equal(foundViaFromUrl("https://pbs.twimg.com/media/abc.jpg"), "X (Twitter)");
});

test("a personal Substack is not treated as an aggregator", () => {
  // lindsaymarsh.substack.com is the author's own publication — that is a
  // creator, not a place a reference was found. Deliberately unmapped.
  assert.equal(foundViaFromUrl("https://lindsaymarsh.substack.com/p/x"), null);
});
