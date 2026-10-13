import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { nextTheme, readTheme, THEME_BOOT_SCRIPT, THEME_COOKIE, themeCookie } from "./theme.ts";

test("no choice reads as system; only light and dark are choices", () => {
  assert.equal(readTheme(""), "system");
  assert.equal(readTheme("a=1; 04am_theme=light"), "light");
  assert.equal(readTheme("04am_theme=dark; b=2"), "dark");
  assert.equal(readTheme("04am_theme=purple"), "system");
  assert.equal(readTheme("x04am_theme=light"), "system");
});

test("choosing system clears the cookie rather than storing a value", () => {
  assert.match(themeCookie("system", true), /^04am_theme=; Max-Age=0; Path=\/; SameSite=Lax; Secure$/);
  assert.match(themeCookie("light", false), /^04am_theme=light; Max-Age=31536000; Path=\/; SameSite=Lax$/);
});

test("the toggle steps system → light → dark → system", () => {
  assert.equal(nextTheme("system"), "light");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "system");
});

test("the boot script reads the same cookie, and only light or dark", () => {
  assert.ok(THEME_BOOT_SCRIPT.includes(`${THEME_COOKIE}=(light|dark)`));
  for (const [cookie, expected] of [
    ["04am_theme=light", "light"],
    ["a=1; 04am_theme=dark", "dark"],
    ["04am_theme=evil", null],
    ["", null],
  ] as const) {
    let set: string | null = null;
    const document = {
      cookie,
      documentElement: { setAttribute: (_k: string, v: string) => (set = v) },
    };
    new Function("document", THEME_BOOT_SCRIPT)(document);
    assert.equal(set, expected);
  }
});

test("the cookie is in the privacy page's table", () => {
  assert.match(readFileSync("app/privacy/page.tsx", "utf8"), /name: "04am_theme"/);
});

// --- the token rules light mode depends on --------------------------

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : []
  );
}
const UI = [...walk("app"), ...walk("components")];

test("no literal white type: `white` means the foreground, faintly", () => {
  const offenders = UI.filter((f) => /\btext-white\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("no brand colour is hard-coded in the UI; it would not follow the theme", () => {
  // OG images and e-mail are drawn outside the page and stay dark. The
  // layout's themeColor is the browser chrome, which has to be a literal.
  const hex = /#(0b0a0e|131218|e7e3d8)\b|rgba\((11, ?10, ?14|231, ?227, ?216)/i;
  const offenders = UI.filter((f) => f !== "app/layout.tsx" && hex.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
