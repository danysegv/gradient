import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientIp, hashed, LIMITS, rule } from "./attempt-rules.ts";
import { rangeHasSuffix, sha1Upper } from "./breached.ts";

// Security review 2026-10-13, #5.

test("an attempt bucket never stores the address or email itself", () => {
  const r = rule("signInPerEmail", "Someone@Example.com ");
  assert.equal(r.bucket, `signInPerEmail:${hashed("someone@example.com")}`);
  assert.ok(!r.bucket.includes("example"));
  assert.equal(r.max, LIMITS.signInPerEmail.max);
  // Case and stray spaces don't make a fresh bucket.
  assert.equal(rule("signInPerEmail", "someone@example.com").bucket, r.bucket);
});

test("the visitor's address comes from Vercel's headers, first hop only", () => {
  const h = (map: Record<string, string>) => (n: string) => map[n] ?? null;
  assert.equal(clientIp(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })), "203.0.113.7");
  assert.equal(clientIp(h({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
  assert.equal(clientIp(h({})), null);
});

test("a leaked password is recognised from a range response", () => {
  // SHA-1("password") = 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8
  const hash = sha1Upper("password");
  assert.equal(hash.slice(0, 5), "5BAA6");
  const body = "1D2DA4053E34E76F6576ED1DA63134B5E2A:2\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n";
  assert.equal(rangeHasSuffix(body, hash.slice(5)), true);
  assert.equal(rangeHasSuffix(body, "0000000000000000000000000000000000A"), false);
  // Padding entries carry a zero count and never match.
  assert.equal(rangeHasSuffix("1E4C9B93F3F0682250B6CF8331B7EE68FD8:0", hash.slice(5)), false);
});

test("every password door counts attempts before it asks Supabase", () => {
  const doors: [string, RegExp][] = [
    ["app/auth/actions.ts", /rulesFor\(await requestIp\(\), "signInPerIp"/],
    ["app/auth/actions.ts", /rulesFor\(await requestIp\(\), "signUpPerIp"\)/],
    ["app/auth/actions.ts", /rulesFor\(await requestIp\(\), "resetPerIp"/],
    ["app/api/extension/session/route.ts", /rulesFor\(await requestIp\(request\), "signInPerIp"/],
    ["app/clip-login/actions.ts", /rulesFor\(await requestIp\(\), "curatorPasswordPerIp"\)/],
  ];
  for (const [file, pattern] of doors) {
    assert.match(readFileSync(file, "utf8"), pattern, file);
  }
  const actions = readFileSync("app/auth/actions.ts", "utf8");
  // A new password is checked against known breaches on sign-up and reset.
  assert.equal(actions.match(/isBreachedPassword\(password\.value\)/g)?.length, 2);
});

test("profiles are read server-side only where private columns are involved", () => {
  // Security review #9: the public key can't read login_key, is_admin or
  // user_id any more, so these reads must use the service role.
  const src = readFileSync("lib/profiles/queries.ts", "utf8");
  assert.ok(!src.includes("supabasePublic"), "lib/profiles/queries.ts must not use the public client");
});
