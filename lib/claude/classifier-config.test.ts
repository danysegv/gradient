import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DEFAULT_CLASSIFIER_MODEL } from "./classifier-config.ts";

// The launch board is derived from a specific model reading a specific
// image at a specific size. These tests exist so that the cheap path can
// sit in the codebase, fully written, WITHOUT quietly becoming the path
// that produced the 09-26 figures.

test("the default model is still the one the library was read with", () => {
  assert.equal(DEFAULT_CLASSIFIER_MODEL, "claude-opus-5");
});

test("no downscale unless someone asks for one", () => {
  // Deliberately reading the source rather than the constant: the constant
  // is computed from process.env, and a test that sets the env would prove
  // nothing about what runs in Vercel with nothing set.
  const src = readFileSync("lib/claude/classifier-config.ts", "utf8");
  assert.match(src, /if \(trimmed === ""\) return null;/);
  assert.match(
    src,
    /if \(!Number\.isFinite\(n\) \|\| n < 224 \|\| n > 2576\) return null;/,
    "a nonsense edge must fall back to the original image, never to a guess"
  );
});

test("a downscale is applied to the CLASSIFIER, never to what is displayed", () => {
  // 04AM shows clips whole, from the rights holder's own server — see the
  // legal note in CLAUDE.md and lib/clip-images.test.ts. Resizing for the
  // model is a private act inside one API request; resizing for a reader
  // would mean 04AM creating a derivative copy, which is the exact thing
  // its safe-harbour position rests on not doing.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : e.name.endsWith(".tsx")
          ? [`${dir}/${e.name}`]
          : []
    );
  const offenders = [...walk("app"), ...walk("components")].filter((f) =>
    readFileSync(f, "utf8").includes("CLASSIFIER_IMAGE_EDGE")
  );
  assert.deepEqual(offenders, [], "a rendering surface is reading the model's image size");
});

test("the cache defaults to an hour, and that is a cost decision only", () => {
  const src = readFileSync("lib/claude/classifier-config.ts", "utf8");
  assert.match(src, /CLASSIFIER_CACHE_5M === "true" \? "5m" : "1h"/);
  // Caching cannot change a response, so unlike the model and the image
  // this one is safe before 09-26. If that ever stops being true, this
  // test is the wrong thing to change.
  assert.match(src, /SAFE TO TURN ON NOW/);
});

test("the frozen classifier's default request is byte-for-byte what it was", () => {
  // The freeze in one assertion. classify-clip.ts now reads its model,
  // image handling and cache TTL from config — which is only safe if the
  // unconfigured path is identical to the code it replaced. If any of
  // these three stops being true, the 09-26 board was derived from an
  // instrument nobody agreed to change.
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");

  // 1. the model comes from config, and config defaults to Opus
  assert.match(src, /CLASSIFIER_MODEL,/);
  assert.equal(DEFAULT_CLASSIFIER_MODEL, "claude-opus-5");

  // 2. with no edge set, the source URL is sent untouched — no fetch, no
  //    re-encode, and 04AM never handles the bytes
  assert.match(
    src,
    /if \(CLASSIFIER_IMAGE_EDGE === null\) \{\s*return \{ type: "image" as const, source: \{ type: "url" as const, url: imageUrl \} \};/
  );

  // 3. a failed downscale falls back to the URL rather than throwing: a
  //    picture that won't shrink costs more, it does not lose the clip
  assert.match(src, /could not downscale/);
  const tail = src.slice(src.indexOf("could not downscale"));
  assert.match(tail, /return \{ type: "image" as const, source: \{ type: "url" as const, url: imageUrl \} \};/);
});

test("the taxonomy prompt itself is untouched", () => {
  // Everything above is about transport. This is the instrument.
  const src = readFileSync("lib/claude/classify-clip.ts", "utf8");
  assert.ok(
    src.includes(
      "You are classifying a design reference image against 04AM's taxonomy"
    )
  );
  assert.match(src, /never force a weak match/);
  assert.match(src, /effort: "low"/);
});
