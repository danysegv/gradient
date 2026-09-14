// A curator's own words about themselves, as they arrive from a form.
// Pure, so the rules are tested rather than assumed — same shape as
// lib/boards/input.ts.

export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 280;

/** Image types the avatars bucket accepts, mirrored here so the form can say so. */
export const AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** 2 MB, matching the bucket's own limit. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type ProfileInput = {
  display_name: string | null;
  bio: string | null;
};

/**
 * Trim, collapse whitespace, cap, and treat blank as absent.
 *
 * Null rather than "" matters: the pages fall back to the handle when
 * display_name is null, and an empty string would render as a nameless
 * heading instead. Same for bio, which is omitted entirely when absent
 * rather than leaving an empty paragraph.
 */
export function parseProfileInput(form: {
  get(key: string): FormDataEntryValue | null;
}): ProfileInput {
  const clean = (raw: FormDataEntryValue | null, max: number) => {
    if (typeof raw !== "string") return null;
    const value = raw.replace(/\s+/g, " ").trim().slice(0, max);
    return value.length > 0 ? value : null;
  };
  return {
    display_name: clean(form.get("display_name"), DISPLAY_NAME_MAX),
    // Bio keeps its line breaks; only runs of spaces collapse.
    bio: ((raw) => {
      if (typeof raw !== "string") return null;
      const value = raw
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, BIO_MAX);
      return value.length > 0 ? value : null;
    })(form.get("bio")),
  };
}

export type AvatarProblem = "type" | "size" | "missing" | null;

/** What's wrong with an uploaded avatar, or null if nothing is. */
export function checkAvatar(file: { type: string; size: number } | null): AvatarProblem {
  if (!file || file.size === 0) return "missing";
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > AVATAR_MAX_BYTES) return "size";
  return null;
}

/**
 * Where a curator's avatar lives in the bucket.
 *
 * The name is the key, so a curator has exactly one avatar and uploading
 * again replaces it — no orphans accumulating in storage, and no way for
 * one curator to write over another's. The extension comes from the MIME
 * type rather than the uploaded filename, which is attacker-controlled.
 */
export function avatarPath(curator: string, mimeType: string): string {
  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/avif"
          ? "avif"
          : "jpg";
  return `${curator.toLowerCase()}.${ext}`;
}
