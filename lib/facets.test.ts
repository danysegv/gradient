import { test } from "node:test";
import assert from "node:assert/strict";
import { facetCounts, filterClips, type Selection } from "./facets.ts";

const AXIS = new Map([
  ["Poetcore", "movement"],
  ["Zinepunk", "movement"],
  ["PhotoWork", "medium"],
  ["PosterWork", "medium"],
]);

const clips = [
  { id: "a", title: "Moth study", source: "Ana Lee", tagNames: ["Poetcore", "PhotoWork"] },
  { id: "b", title: "Riot flyer", source: null, tagNames: ["Zinepunk", "PosterWork"] },
  { id: "c", title: "Soft poster", source: "Studio Mar", tagNames: ["Poetcore", "PosterWork"] },
  { id: "d", title: "Untagged", source: null, tagNames: [] },
];

const sel = (entries: [string, string[]][]): Selection =>
  new Map(entries.map(([k, v]) => [k, new Set(v)]));

test("no selection and no query returns every clip", () => {
  assert.equal(filterClips(clips, new Map(), "").length, 4);
});

test("selections on one axis OR together", () => {
  const ids = filterClips(clips, sel([["movement", ["Poetcore", "Zinepunk"]]]), "").map((c) => c.id);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("selections across axes AND together", () => {
  const ids = filterClips(
    clips,
    sel([["movement", ["Poetcore"]], ["medium", ["PosterWork"]]]),
    ""
  ).map((c) => c.id);
  assert.deepEqual(ids, ["c"]);
});

test("query matches title and credit, every word, any case", () => {
  assert.deepEqual(filterClips(clips, new Map(), "studio POSTER").map((c) => c.id), ["c"]);
  assert.deepEqual(filterClips(clips, new Map(), "  ana  ").map((c) => c.id), ["a"]);
});

test("a count is what clicking that tag would return", () => {
  const selection = sel([["movement", ["Poetcore"]]]);
  const counts = facetCounts(clips, selection, "", AXIS);
  // Same axis ignores its own selection: adding Zinepunk would OR it in.
  assert.equal(counts.get("Zinepunk"), 1);
  assert.equal(counts.get("Poetcore"), 2);
  // Other axis respects it: only Poetcore clips count.
  assert.equal(counts.get("PhotoWork"), 1);
  assert.equal(counts.get("PosterWork"), 1);
  for (const [name, n] of counts) {
    const axis = AXIS.get(name)!;
    const next = new Map(selection);
    next.set(axis, new Set([...(selection.get(axis) ?? []), name]));
    const added = filterClips(clips, next, "").filter((c) => c.tagNames.includes(name));
    assert.equal(added.length, n, name);
  }
});

test("counts respect the text query", () => {
  const counts = facetCounts(clips, new Map(), "riot", AXIS);
  assert.equal(counts.get("Zinepunk"), 1);
  assert.equal(counts.get("Poetcore"), undefined);
});
