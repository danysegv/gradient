"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/clip-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseEmail } from "@/lib/auth/email";
import { parseUsername } from "@/lib/profiles/username";

export type TeamState =
  | { ok: string; error?: never }
  | { error: string; ok?: never }
  | undefined;

// Approving an account as a curator. Admins only, checked here from the
// session — never from the form. link_curator() does the linking in one
// statement and is callable only with the service-role key.
export async function approveCurator(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const session = await getSession();
  if (!session?.isAdmin) return { error: "Only an admin can approve curators." };

  const email = parseEmail(formData.get("email"));
  if (!email.ok) return { error: email.error };
  const name = parseUsername(formData.get("username"));
  if (!name.ok) return { error: name.error };

  const { data, error } = await supabaseAdmin.rpc("link_curator", {
    p_email: email.value,
    p_name: name.value,
  });
  if (error) return { error: error.message };

  switch (data as string) {
    case "linked":
      revalidatePath("/clip/team");
      return { ok: `${email.value} now signs in as @${name.value}.` };
    case "created":
      revalidatePath("/clip/team");
      revalidatePath("/curators");
      return { ok: `@${name.value} created and linked to ${email.value}.` };
    case "no_account":
      return { error: "No account with that email yet — ask them to sign up first." };
    case "already_curator":
      return { error: "That account is already a curator." };
    case "taken":
      return { error: `@${name.value} belongs to someone else.` };
    default:
      return { error: "That username isn't allowed." };
  }
}
