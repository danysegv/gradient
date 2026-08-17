import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseConfig(): [string, string] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return [supabaseUrl, supabaseAnonKey];
}

// Cookie-backed client for Server Components, Server Actions, and Route
// Handlers. It carries the signed-in user's access token, so database calls
// made through it remain subject to RLS.
export async function createClient() {
  const cookieStore = await cookies();
  const [supabaseUrl, supabaseAnonKey] = getSupabaseConfig();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot write cookies. Proxy refreshes sessions
          // before they render, so writes are only required in mutable
          // contexts such as Server Actions and Route Handlers.
        }
      },
    },
  });
}
