"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_ONLY_COOKIE, sessionOnly } from "@/lib/auth/remember";

// Browser half of visitor accounts — see lib/supabase/auth-server.ts. One
// client per tab; it refreshes the session and writes the cookies back.
//
// The cookies are read and written here rather than by the library's
// default so that "Remember me" off (lib/auth/remember.ts) survives a
// refresh: the default would put the 400-day Max-Age back.
let client: SupabaseClient | null = null;

type CookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

function readAll(): { name: string; value: string }[] {
  if (document.cookie === "") return [];
  return document.cookie.split("; ").map((pair) => {
    const i = pair.indexOf("=");
    const name = i < 0 ? pair : pair.slice(0, i);
    const raw = i < 0 ? "" : pair.slice(i + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // leave it as written
    }
    return { name, value };
  });
}

function write(name: string, value: string, o: CookieOptions) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${o.path ?? "/"}`;
  if (o.domain) c += `; Domain=${o.domain}`;
  if (typeof o.maxAge === "number") c += `; Max-Age=${Math.floor(o.maxAge)}`;
  if (o.expires) c += `; Expires=${o.expires.toUTCString()}`;
  const same = o.sameSite === true ? "strict" : o.sameSite || "lax";
  c += `; SameSite=${same[0].toUpperCase()}${same.slice(1)}`;
  if (o.secure || location.protocol === "https:") c += "; Secure";
  document.cookie = c;
}

export function authBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => readAll(),
          setAll: (list) => {
            const forget = readAll().some((c) => c.name === SESSION_ONLY_COOKIE && c.value === "1");
            for (const { name, value, options } of list) {
              const o = options as CookieOptions;
              write(name, value, forget ? sessionOnly(o) : o);
            }
          },
        },
      }
    );
  }
  return client;
}
