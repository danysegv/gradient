import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sessionOnly } from "./remember.ts";
import { isSiteBridgeCall } from "../extension/cors.ts";

// One sign-in across the site and the extension (2026-09-27).

test("'Remember me' off: auth cookies last only as long as the browser", () => {
  const long = { path: "/", maxAge: 400 * 24 * 3600, sameSite: "lax" as const };
  assert.deepEqual(sessionOnly(long), { path: "/", sameSite: "lax" });
  assert.equal("expires" in sessionOnly({ expires: new Date() }), false);
  // A removal still has to remove.
  assert.deepEqual(sessionOnly({ path: "/", maxAge: 0 }), { path: "/", maxAge: 0 });
});

const call = (headers: Record<string, string>) =>
  new Request("https://gradient-flax.vercel.app/api/extension/handoff", { method: "POST", headers });

test("the site bridge answers only the extension's script on 04AM itself", () => {
  assert.equal(isSiteBridgeCall(call({ "x-04am-clipper": "1", "sec-fetch-site": "same-origin" })), true);
  // Another site, even with the header (it would need CORS to send it anyway).
  assert.equal(isSiteBridgeCall(call({ "x-04am-clipper": "1", "sec-fetch-site": "cross-site" })), false);
  // A plain form post from anywhere has no custom header.
  assert.equal(isSiteBridgeCall(call({ "sec-fetch-site": "same-origin" })), false);
  // Older browsers without Sec-Fetch-Site: the Origin must be this host.
  assert.equal(isSiteBridgeCall(call({ "x-04am-clipper": "1", origin: "https://gradient-flax.vercel.app", host: "gradient-flax.vercel.app" })), true);
  assert.equal(isSiteBridgeCall(call({ "x-04am-clipper": "1", origin: "https://evil.example", host: "gradient-flax.vercel.app" })), false);
});

test("the cookie-riding endpoints refuse anything but the site bridge", () => {
  for (const f of ["app/api/extension/handoff/route.ts", "app/api/extension/adopt/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /if \(!isSiteBridgeCall\(request\)\) return json\(request, \{ error: "Bad request\." \}, 400\)/, f);
  }
});

test("signing out of the site ends the paired extension session, and back", () => {
  for (const f of ["app/auth/actions.ts", "app/clip/logout-actions.ts"]) {
    const src = readFileSync(f, "utf8");
    const out = src.indexOf("endPairedSessions(");
    assert.ok(out > 0, f);
    assert.ok(out < src.indexOf("auth.signOut()", out), `${f}: pairs must end before the session does`);
  }
  assert.match(readFileSync("lib/auth/extension-session.ts", "utf8"), /endPairedSessions\(session\?\.sessionId\)/);
});

test("a token only counts while its session exists", () => {
  const sql = readFileSync("scripts/session-pairs.sql", "utf8");
  assert.match(sql, /join auth\.sessions s\s+on s\.id = nullif\(auth\.jwt\(\) ->> 'session_id', ''\)::uuid/);
  assert.match(sql, /revoke all on function public\.end_paired_sessions\(uuid\) from public, anon, authenticated/);
});

test("the extension's site script runs on 04AM's own pages and nowhere else", () => {
  const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
  assert.deepEqual(manifest.content_scripts, [
    {
      matches: ["https://gradient-flax.vercel.app/*", "http://localhost:3000/*"],
      js: ["site.js"],
      run_at: "document_idle",
    },
  ]);
  // Still no "read all sites" permission.
  assert.equal(JSON.stringify(manifest.permissions).includes("<all_urls>"), false);
  assert.deepEqual(manifest.host_permissions, ["https://gradient-flax.vercel.app/*"]);
});
