"use server";

import { getSessionCurator } from "@/lib/clip-session";

// Where "My profile" in the account menu goes. Asked of the one session
// door, so it is the current username — the same name the profile page is
// keyed on — and null for a signed-in visitor who isn't a curator, who has
// no profile to go to and so sees no link.
export async function myProfileHref(): Promise<string | null> {
  const name = await getSessionCurator();
  return name ? `/curator/${encodeURIComponent(name)}` : null;
}
