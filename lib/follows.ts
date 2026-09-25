import "server-only";
import { authServerClient } from "@/lib/supabase/auth-server";

// Who the signed-in account follows. Read with the visitor's own session,
// so RLS returns their rows and nobody else's. Signed out, or on any
// failure, it is an empty list — a page never breaks over a follow read.

export type FollowView = { signedIn: boolean; following: string[] };

export async function getFollowView(): Promise<FollowView> {
  try {
    const supabase = await authServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { signedIn: false, following: [] };
    const { data, error } = await supabase
      .from("follows")
      .select("curator_name, created_at")
      .order("created_at", { ascending: false });
    if (error) return { signedIn: true, following: [] };
    return {
      signedIn: true,
      following: ((data ?? []) as { curator_name: string }[]).map((r) => r.curator_name),
    };
  } catch {
    return { signedIn: false, following: [] };
  }
}
