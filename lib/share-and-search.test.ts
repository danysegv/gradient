import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { configuredSiteOrigin } from "./site-url.ts";

// How 04AM looks when a link is shared or searched (2026-10-14).

test("the site address for metadata, sitemap and robots", () => {
  assert.equal(configuredSiteOrigin({ NEXT_PUBLIC_SITE_URL: "https://04am.studio/" }), "https://04am.studio");
  assert.equal(configuredSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "gradient-flax.vercel.app" }), "https://gradient-flax.vercel.app");
  assert.equal(configuredSiteOrigin({}), "http://localhost:3000");
});

test("04AM's own icons, not Next.js's", () => {
  const nextDefault = "2b8ad2d33455a8f7"; // sha256 prefix of create-next-app's favicon.ico
  const favicon = createHash("sha256").update(readFileSync("app/favicon.ico")).digest("hex");
  assert.notEqual(favicon.slice(0, 16), nextDefault);
  for (const f of ["app/icon.svg", "app/apple-icon.png"]) assert.ok(existsSync(f), f);
  const icon = readFileSync("app/icon.svg", "utf8");
  assert.match(icon, /fill-rule="evenodd"/); // the wordmark's counters
  // The tab icon is the bare mark on transparent (Daniela, 2026-10-14):
  // Ink on a light device, Bone on a dark one, no tile behind it.
  assert.doesNotMatch(icon, /<rect/);
  assert.match(icon, /fill: #0b0a0e/);
  assert.match(icon, /prefers-color-scheme: dark\) \{ path \{ fill: #e7e3d8/);
});

test("the share card is 1200×630 and described", () => {
  for (const name of ["opengraph-image", "twitter-image"]) {
    const png = readFileSync(`app/${name}.png`);
    assert.equal(png.readUInt32BE(16), 1200, name);
    assert.equal(png.readUInt32BE(20), 630, name);
    assert.ok(readFileSync(`app/${name}.alt.txt`, "utf8").trim().length > 10, `${name}.alt.txt`);
  }
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /metadataBase: new URL\(configuredSiteOrigin\(process\.env\)\)/);
  assert.match(layout, /card: "summary_large_image"/);
});

test("clip pages never use the clip's image as their share card", () => {
  // That would put a rights holder's work into 04AM's own card — a copy.
  const clip = readFileSync("app/clip/[id]/page.tsx", "utf8");
  assert.doesNotMatch(clip, /openGraph|twitter:\s*\{|images:/);
  assert.ok(!existsSync("app/clip/[id]/opengraph-image.tsx") && !existsSync("app/clip/[id]/opengraph-image.png"));
});

test("robots.txt keeps crawlers out of the tools, not the public clip pages", () => {
  const robots = readFileSync("app/robots.ts", "utf8");
  for (const p of ['"/clip$"', '"/clip/team"', '"/api/"', '"/clip-login"']) assert.ok(robots.includes(p), p);
  assert.ok(!robots.includes('"/clip/"'), "/clip/<id> must stay crawlable");
  for (const f of ["app/clip/page.tsx", "app/clip/team/page.tsx", "app/clip-login/page.tsx", "app/notifications/page.tsx", "app/reset-password/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /robots: \{ index: false, follow: false \}/, f);
  }
});

test("the sitemap lists public pages only", () => {
  const src = readFileSync("app/sitemap.ts", "utf8");
  assert.match(src, /\.is\("archived_at", null\)/);
  assert.match(src, /isClassified\(/);
  assert.match(src, /\.eq\("is_public", true\)/);
  assert.match(src, /isPublished\("privacy"\)/);
  assert.doesNotMatch(src, /supabaseAdmin/);
});
