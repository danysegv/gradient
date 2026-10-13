// Light and dark (Daniela, 2026-10-13). Pure, so the rules are tested.
//
// Three settings: "system" follows the device; "light" and "dark" are a
// choice the visitor made, kept in one cookie. A preference record, like
// 04am_cookie_notice: it remembers something the visitor asked for and
// tracks nothing, so it sits in the privacy page's cookie table and needs
// no consent (lib/cookie-notice.ts).
//
// Read in the browser, before first paint, by THEME_BOOT_SCRIPT in
// app/layout.tsx. Not on the server: reading cookies() in the root layout
// would turn every static page dynamic, the same reason the cookie notice
// decides in the browser.

export const THEME_COOKIE = "04am_theme";
export type ThemeSetting = "system" | "light" | "dark";
export const THEME_SETTINGS: ThemeSetting[] = ["system", "light", "dark"];

/** One year. */
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export function readTheme(cookieHeader: string): ThemeSetting {
  for (const pair of cookieHeader.split(/;\s*/)) {
    const [k, v] = pair.split("=");
    if (k === THEME_COOKIE && (v === "light" || v === "dark")) return v;
  }
  return "system";
}

/** "system" clears the cookie: no choice, nothing stored. */
export function themeCookie(setting: ThemeSetting, secure: boolean): string {
  const tail = `; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return setting === "system"
    ? `${THEME_COOKIE}=; Max-Age=0${tail}`
    : `${THEME_COOKIE}=${setting}; Max-Age=${THEME_MAX_AGE}${tail}`;
}

/** The order the toggle steps through. */
export function nextTheme(current: ThemeSetting): ThemeSetting {
  return THEME_SETTINGS[(THEME_SETTINGS.indexOf(current) + 1) % THEME_SETTINGS.length];
}

/**
 * Runs inline in <head>, before anything paints, so a chosen theme never
 * flashes the other one first. Kept tiny and self-contained: no imports
 * survive into an inline script, so the cookie name is spelled here and a
 * test checks it matches THEME_COOKIE.
 */
export const THEME_BOOT_SCRIPT =
  `try{var m=document.cookie.match(/(?:^|; )04am_theme=(light|dark)/);` +
  `if(m)document.documentElement.setAttribute("data-theme",m[1])}catch(e){}`;
