// The search query as it travels through a URL: ?q=film+photography.
// Pure, so the rules are tested rather than assumed.

export const QUERY_MAX = 200;

/** Trim, collapse whitespace, cap the length. Empty means "not searching". */
export function normaliseQuery(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, QUERY_MAX);
}

/** Search results arrive ranked; keep that order when rows come back unordered. */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const position = new Map(ids.map((id, i) => [id, i]));
  return rows
    .filter((r) => position.has(r.id))
    .sort((a, b) => position.get(a.id)! - position.get(b.id)!);
}
