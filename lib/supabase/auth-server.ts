import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Visitor accounts (2026-09-21): email sign-in links through Supabase Auth.
//
// This is NOT the curator gate. Curators still sign in to /clip with their
// own password (lib/clip-auth.ts) — the two Supabase-Auth attempts CLAUDE.md
// warns about were for that gate, and it stays exactly as it is. An account
// here is a visitor's way into the library; it grants no write access to
// clips, tags, boards or anything a figure is computed from.
//
// The session lives in cookies. Server components can only READ them (a
// render can't set a cookie), so tokens are refreshed in the browser by
// components/session-keeper.tsx rather than in proxy.ts — the proxy's
// matcher stays exactly ["/clip"].
export async function authServerClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) {
              store.set(name, value, options);
            }
          } catch {
            // Called from a server component render, where cookies are
            // read-only. Harmless: the browser refreshes the session.
          }
        },
      },
    }
  );
}

/** The signed-in visitor's email, or null. Validated with Supabase, never
 * trusted from the cookie alone. */
export async function getVisitorEmail(): Promise<string | null> {
  try {
    const supabase = await authServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}
