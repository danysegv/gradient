// Board URLs: /curator/<name>/boards/<slug>. The slug is set once, from
// the title at creation, and never changes on rename — a link someone
// saved keeps working. Must satisfy the boards.slug check constraint:
// ^[a-z0-9]+(-[a-z0-9]+)*$, at most 60 characters.
export const SLUG_MAX = 60;

export function slugify(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
  return base || "board";
}

export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(title);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const stem = base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "");
    const candidate = `${stem || "board"}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
