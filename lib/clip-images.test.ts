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
// components/clip-thumbnail.tsx and components/boards/board-card.tsx).
// This test is the tripwire that stops a future "just fill the box" fix
// from quietly reintroducing a crop anywhere in the app.
test("no .tsx file under app/ or components/ crops an image with object-cover", () => {
  const offenders = [...walk("app"), ...walk("components")].filter((f) =>
    readFileSync(f, "utf8").includes("object-cover")
  );
  assert.deepEqual(offenders, []);
});
