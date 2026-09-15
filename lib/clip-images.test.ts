import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// A clip's image IS the reference — cropping it with object-cover shows a
// designer a different composition than the one that was actually clipped,
// which is a misrepresentation of the work, not a display choice. Every
// clip image in the app sizes to its own aspect ratio instead (see
// components/clip-thumbnail.tsx). This test is the tripwire that stops a
// future "just fill the box" fix from quietly reintroducing a crop.
//
// ONE deliberate exception, added 2026-09-14 by Daniela's decision: a board
// card's cover grid. A cover is not a reference — it is a board's
// identifier, sitting in a row beside other boards, and at thumbnail size
// tiles of differing heights read as broken rather than as respect for the
// work. Everywhere a clip is shown AS a clip, including the board page
// itself, it is still never cropped.
//
// Adding to this list is a product decision, not a fix. Whatever goes here
// needs a comment in the file saying why a crop is honest there.
const CROP_ALLOWED = [
  "components/boards/board-card.tsx",
];

test("no .tsx file under app/ or components/ crops an image with object-cover", () => {
  const offenders = [...walk("app"), ...walk("components")]
    .filter((f) => readFileSync(f, "utf8").includes("object-cover"))
    .filter((f) => !CROP_ALLOWED.includes(f));
  assert.deepEqual(offenders, []);
});

test("the one allowed crop still says why it is allowed", () => {
  // A bare object-cover with the reasoning deleted is how an exception
  // becomes a precedent.
  for (const f of CROP_ALLOWED) {
    const src = readFileSync(f, "utf8");
    assert.match(
      src,
      /ONE PLACE IN THE APP THAT CROPS|deliberate exception/,
      `${f} crops without explaining why`
    );
  }
});

test("no remote clip image sets its own referrer policy", () => {
  // The referrer policy is a rights decision, not a per-component style
  // choice — it controls whether a rights holder can see, attribute or
  // refuse the traffic 04AM sends them. One constant, one decision, in
  // lib/clip-images.ts. A literal here means the grid and a board cover
  // could ask for the same image on different terms.
  const offenders = [...walk("app"), ...walk("components")]
    .filter((f) => /referrerPolicy\s*=\s*"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("every remote clip image sets one", () => {
  // Omitting it isn't the same decision made quietly — it takes whatever
  // the browser defaults to that year.
  const offenders = [...walk("app"), ...walk("components")]
    .filter((f) => readFileSync(f, "utf8").includes("<img"))
    .filter((f) => !readFileSync(f, "utf8").includes("CLIP_IMAGE_REFERRER_POLICY"));
  assert.deepEqual(offenders, []);
});
