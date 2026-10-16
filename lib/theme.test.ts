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

test("the extension follows the system the same way: its pages and the in-page picker", () => {
  for (const f of ["extension/ui.css", "extension/content.js"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /@media \(prefers-color-scheme: light\)/, `${f} has no light scheme`);
    assert.match(src, /--ink: #f3f1eb/, `${f} light ground is not the site's paper`);
  }
});

// Readable text in both modes (contrast pass, 2026-10-16). Faded Bone is how
// the product does hierarchy, but below 60% small text drops under WCAG AA's
// 4.5:1: /55 measured 4.25:1 on light paper, /45 3.75:1 on Ink. So 60% is the
// floor for any text, placeholders included; hierarchy lives between 60 and 100.
const FAINT_FLOOR = 60;

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function mix(fg: string, bg: string, alpha: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, b] = [p(fg), p(bg)];
  return "#" + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test("the faintest allowed text still reads at 4.5:1 in dark and light", () => {
  const modes = [
    { name: "dark", ink: "#0b0a0e", bone: "#e7e3d8" },
    { name: "light", ink: "#f3f1eb", bone: "#0b0a0e" },
  ];
  for (const m of modes) {
    const ratio = contrast(mix(m.bone, m.ink, FAINT_FLOOR / 100), m.ink);
    assert.ok(ratio >= 4.5, `${m.name}: text-bone/${FAINT_FLOOR} is ${ratio.toFixed(2)}:1`);
  }
});

test("no text is fainter than the floor", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []
    );
  const faint: string[] = [];
  for (const f of ["app", "components", "lib"].flatMap(walk)) {
    for (const m of readFileSync(f, "utf8").matchAll(/text-(?:bone|white)\/(\d+)/g)) {
      if (Number(m[1]) < FAINT_FLOOR) faint.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(faint, []);
});

test("Oxide and Slate never colour small text; a StateDot carries the state", () => {
  // Coloured type is for large numerals (24px+) and icons only. Each allowed
  // use is listed with why; anything else should be Bone text + <StateDot>.
  const allowed = [
    "app/trend/[name]/page.tsx: movementUp ? \"text-oxide\"", // the 26px Movement figure
    "components/like-button.tsx: liked ? \"text-oxide\" : \"text-slate", // a heart icon, not text
    'components/site-header.tsx: <span aria-hidden className="text-oxide">+</span>', // the Clip "+", a symbol
  ];
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []
    );
  const found: string[] = [];
  for (const f of ["app", "components"].flatMap(walk)) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (!/\btext-(oxide|slate)\b(?!\/)/.test(line)) return;
      if (/text-\[(2[4-9]|[3-9]\d|\d{3})px\]/.test(line)) return; // large on the same line
      if (allowed.some((a) => { const [file, snip] = a.split(": "); return f === file && line.includes(snip); })) return;
      found.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, []);
});
