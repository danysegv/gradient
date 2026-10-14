import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
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

// Security review 2026-10-13, #11: what curators install talks to the live
// site only. The unpacked source keeps localhost for development; the
// committed download must not.
function manifestInZip(path: string): { content_scripts?: { matches: string[] }[]; host_permissions?: string[] } {
  const zip = readFileSync(path);
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50; ) {
    const method = zip.readUInt16LE(at + 8);
    const size = zip.readUInt32LE(at + 18);
    const nameLength = zip.readUInt16LE(at + 26);
    const extraLength = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + 30, at + 30 + nameLength).toString();
    const start = at + 30 + nameLength + extraLength;
    const body = zip.subarray(start, start + size);
    if (name.endsWith("/manifest.json") || name === "manifest.json") {
      return JSON.parse((method === 8 ? inflateRawSync(body) : body).toString());
    }
    at = start + size;
  }
  throw new Error("no manifest.json in the zip");
}

test("the downloadable clipper never runs on localhost", () => {
  const m = manifestInZip("public/clipper/04am-clipper-chrome.zip");
  const everywhere = [...(m.content_scripts ?? []).flatMap((c) => c.matches), ...(m.host_permissions ?? [])];
  assert.ok(everywhere.length > 0);
  for (const p of everywhere) assert.doesNotMatch(p, /localhost|127\.0\.0\.1/, p);
});
