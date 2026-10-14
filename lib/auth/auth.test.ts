import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { safeNext } from "./next.ts";
import { parsePassword, parseNewPassword, PASSWORD_MIN, PASSWORD_SYMBOLS, passwordMissing } from "./password.ts";

test("after sign-in, only a path on this site is followed", () => {
  assert.equal(safeNext("/clip"), "/clip");
  assert.equal(safeNext("/curator/danysegv?x=1"), "/curator/danysegv?x=1");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "clip", "", null, undefined]) {
    assert.equal(safeNext(bad), "/", String(bad));
  }
});

test("passwords: long enough, not too long", () => {
  assert.equal(parsePassword("short").ok, false);
  assert.equal(parsePassword("Xx1!".repeat(PASSWORD_MIN / 4)).ok, true);
  assert.equal(parsePassword("x".repeat(100)).ok, false);
  assert.equal(parsePassword(undefined).ok, false);
});

test("a new password must be confirmed, and match", () => {
  const pw = "Correct horse 9!";
  assert.equal(parseNewPassword(pw, pw).ok, true);
  assert.deepEqual(parseNewPassword(pw, "Correct horse 9"), { ok: false, error: "The passwords don't match." });
  assert.deepEqual(parseNewPassword(pw, ""), { ok: false, error: "Confirm your password." });
  assert.deepEqual(parseNewPassword(pw, undefined), { ok: false, error: "Confirm your password." });
  // Length is still checked first.
  assert.equal(parseNewPassword("short", "short").ok, false);
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

test("nothing but the session module reads who the curator is from a cookie", () => {
  // Reading the password cookie directly yields the stable login KEY, not
  // the current username — which is how, before 2026-09-21, a rename would
  // have credited new clips to the old name. One door: lib/clip-session.ts.
  const allowed = new Set([
    "lib/clip-session.ts",
    "lib/clip-auth.ts",
    "app/clip-login/actions.ts", // sets the legacy cookie
    "app/clip/logout-actions.ts", // clears it
  ]);
  const offenders = [...walk("app"), ...walk("lib"), ...walk("components")]
    .filter((f) => !allowed.has(f) && !f.endsWith(".test.ts"))
    .filter((f) => /sessionCurator\(|isValidSessionToken\(|CLIP_SESSION_COOKIE/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("nothing but the session module turns a bearer token into a curator", () => {
  // The extension's token is a second key to the same door, not a second
  // door. Route handlers ask lib/clip-session.ts; none read the header or
  // call my_curator_profile themselves.
  // lib/cron-auth.ts reads the header for a MACHINE key (Vercel Cron's
  // secret), which never becomes a curator; it is the only other reader.
  const allowed = new Set(["lib/clip-session.ts", "lib/cron-auth.ts"]);
  const offenders = [...walk("app"), ...walk("lib"), ...walk("components")]
    .filter((f) => !allowed.has(f) && !f.endsWith(".test.ts"))
    .filter((f) => /headers\.get\(\s*["']authorization["']|my_curator_profile/i.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("every extension endpoint that touches the library checks the bearer session first", () => {
  for (const f of ["app/api/extension/clip/route.ts", "app/api/extension/lookup/route.ts", "app/api/extension/me/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /getBearerSession\(request\)/, f);
    assert.match(src, /if \(!session\) return json\(request, \{ error: "Signed out\." \}, 401\)/, f);
  }
});

test("a new password needs upper and lowercase, a number and a symbol (2026-10-14)", () => {
  assert.deepEqual(parsePassword("password12"), { ok: false, error: "Add an uppercase letter and a symbol." });
  assert.deepEqual(parsePassword("Password12"), { ok: false, error: "Add a symbol." });
  assert.deepEqual(parsePassword("Abcdefg!"), { ok: false, error: "Add a number." });
  assert.equal(parsePassword("Password12!").ok, true);
  assert.deepEqual(passwordMissing(""), [`${PASSWORD_MIN}+ characters`, "a lowercase letter", "an uppercase letter", "a number", "a symbol"]);
  // Supabase's own symbol list, so the site and Supabase agree on every character.
  for (const c of PASSWORD_SYMBOLS) assert.equal(parsePassword(`Abcdefg1${c}`).ok, true, c);
  // A space is not one of them, on either side.
  assert.equal(parsePassword("Abcdefg1 ").ok, false);
});
