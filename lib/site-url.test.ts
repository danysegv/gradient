import { test } from "node:test";
import assert from "node:assert/strict";
import { siteOrigin } from "./site-url.ts";

// Security review 2026-10-13, #10: emailed links never take their address
// from the request in production.

const forged = { host: "evil.example", proto: "https" };

test("production ignores the request's host", () => {
  const env = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "gradient-flax.vercel.app" };
  assert.equal(siteOrigin(env, forged), "https://gradient-flax.vercel.app");
});

test("an explicit site address wins everywhere", () => {
  const env = { NEXT_PUBLIC_SITE_URL: "https://04am.studio/", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "gradient-flax.vercel.app" };
  assert.equal(siteOrigin(env, forged), "https://04am.studio");
  assert.equal(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://04am.studio" }, { host: "localhost:3456", proto: null }), "https://04am.studio");
});

test("local dev still follows its own port", () => {
  assert.equal(siteOrigin({}, { host: "localhost:3456", proto: null }), "http://localhost:3456");
});
