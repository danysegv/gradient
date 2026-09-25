"use server";

import { revalidatePath } from "next/cache";
import { authServerClient } from "@/lib/supabase/auth-server";

export type FollowResult = { following: boolean } | { error: "signin" | string };

// Follow or unfollow a curator as the signed-in account. The table's RLS
// is the real rule (your own rows only, never your own profile); this
// just asks. Idempotent both ways: following twice or unfollowing someone
// you don't follow is not an error.
export async function setFollow(curatorName: string, follow: boolean): Promise<FollowResult> {
  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "signin" };

  const name = curatorName.toLowerCase();
  if (follow) {
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: auth.user.id, curator_name: name }, { ignoreDuplicates: true });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", auth.user.id)
      .eq("curator_name", name);
    if (error) return { error: error.message };
  }

  revalidatePath("/curators");
  revalidatePath(`/curator/${encodeURIComponent(name)}`);
  return { following: follow };
}
