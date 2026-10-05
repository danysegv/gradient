import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// An address that already has an account gets no email from Supabase's
// signUp (anti-enumeration). The sign-up action must send a reset link in
// that case, or the person waits for an email that never arrives.
test("a repeated sign-up still sends an email", () => {
  const src = readFileSync("app/auth/actions.ts", "utf8");
  const body = src.slice(src.indexOf("export async function signUp"), src.indexOf("export async function signIn"));
  assert.match(body, /identities\?\.length \?\? 0\) === 0/, "must detect the repeated sign-up");
  assert.match(body, /resetPasswordForEmail\(/, "must send the reset link");
  // and the reply must not reveal whether the account existed
  const notices = [...body.matchAll(/notice: `([^`]+)`/g)].map((m) => m[1]);
  assert.equal(notices.length, 1, "one answer for both cases");
});
