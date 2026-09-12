// The search query as it travels through a URL: ?q=film+photography&color=teal.
// Pure, so the rules are tested rather than assumed.

import { isColorBucket, type ColorBucket } from "../color/buckets.ts";

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

/**
 * The colour swatch as it travels through a URL. Anything that isn't one of
 * the dozen buckets is dropped rather than passed on: the value reaches a
 * SECURITY DEFINER function, so it gets checked against the list here and
 * again by the bucket the row was stored under, never trusted from the bar.
 */
export function normaliseColor(raw: unknown): ColorBucket | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isColorBucket(value) ? value : null;
}
