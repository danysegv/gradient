import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { clipperRelease } from "./release.ts";

// The zip on /clip is COMMITTED, not built on the server, so nothing else
// would notice it going stale. These two tests are that notice: edit the
// extension without re-running `node extension/build.mjs` and the suite
// fails here, before a curator downloads last week's clipper.

// Lives in extension/ but is never shipped inside it: the build script,
// the docs, the build output, and the store screenshots.
const NOT_SHIPPED = new Set(["build.mjs", "README.md", "STORE.md", "dist", "store"]);

function walk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (NOT_SHIPPED.has(rel)) continue;
    if (statSync(`${dir}/${name}`).isDirectory()) out.push(...walk(`${dir}/${name}`, rel));
    else out.push(rel);
  }
  return out;
}

test("the committed clipper zip matches the extension source", () => {
  assert.ok(existsSync("public/clipper/04am-clipper-chrome.zip"), "run: node extension/build.mjs");
  assert.ok(Object.keys(clipperRelease.sources).length > 10, "release.ts looks empty");
  for (const [rel, expected] of Object.entries(clipperRelease.sources)) {
    const actual = createHash("sha256").update(readFileSync(`extension/${rel}`)).digest("hex");
    assert.equal(actual, expected, `extension/${rel} changed — re-run: node extension/build.mjs`);
  }
});

test("every shipped file is accounted for, so a new one can't be left out", () => {
  assert.deepEqual(
    walk("extension"),
    Object.keys(clipperRelease.sources).sort(),
    "a file was added to or removed from extension/ — re-run: node extension/build.mjs"
  );
});

test("the version on the card is the manifest's own", () => {
  const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
  assert.equal(clipperRelease.version, manifest.version);
});
