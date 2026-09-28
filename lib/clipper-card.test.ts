import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardHidden, cardKey } from "./clipper-card.ts";

test("hidden only for the sign-in that hid it", () => {
  const first = { sessionId: "aaa", loginKey: "vicmarodin" };
  const next = { sessionId: "bbb", loginKey: "vicmarodin" };
  const cookie = cardKey(first);
  assert.equal(cardHidden(cookie, first), true);
  assert.equal(cardHidden(cookie, next), false, "a new sign-in shows it again");
  assert.equal(cardHidden(undefined, first), false, "never hidden by default");
  assert.equal(cardHidden(cardKey({ loginKey: "x" }), { loginKey: "x" }), true);
});

test("signing out forgets it, on both ways out", () => {
  for (const f of ["app/clip/logout-actions.ts", "app/auth/actions.ts"]) {
    assert.match(readFileSync(f, "utf8"), /delete\(CLIPPER_CARD_COOKIE\)/, f);
  }
});

test("the card no longer remembers per browser", () => {
  const src = readFileSync("components/clipper-install.tsx", "utf8");
  assert.doesNotMatch(src, /localStorage/);
});
