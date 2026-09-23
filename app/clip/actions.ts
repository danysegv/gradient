"use server";

import { revalidatePath } from "next/cache";
import { getSessionCurator } from "@/lib/clip-session";
import { parseClipInput } from "@/lib/clips/clip-input";
import { insertClip } from "@/lib/clips/create";

export type CreateClipState =
  | { error: string; success?: never }
  | { error?: never; success: true }
  | undefined;

// The /clip form's door. The browser extension's door is
// app/api/extension/clip/route.ts; both validate with parseClipInput and
// save with insertClip, so they accept exactly the same clips.
export async function createClip(
  _prevState: CreateClipState,
  formData: FormData
): Promise<CreateClipState> {
  // Server Actions are reachable via direct POST — re-verify here even
  // though Proxy already gates the /clip route.
  // Current username, never the login key: this is the credit the clip
  // carries in public.
  const curatorName = await getSessionCurator();
  if (!curatorName) {
    return { error: "Not authorized." };
  }

  const parsed = parseClipInput((key) => formData.get(key));
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const saved = await insertClip(parsed.value, curatorName);
  if (!saved.ok) {
    return { error: saved.error };
  }

  revalidatePath("/clip");
  return { success: true };
}
