// The archive baseline: public-domain works from museum open-access APIs,
// released CC0. Read with the same classifier, kept in their own series
// and never pooled with the market — they are what "old" looks like in
// 04AM's vocabulary, for a later revival-versus-emergence read, not part
// of what is being published now.

import { marketHeaders } from "./compliance.ts";

export type ArchiveItem = { url: string; title: string | null; imageUrl: string };

const CONTACT = "04AM market series (https://gradient-flax.vercel.app/radar)";

/** Art Institute of Chicago: a random page of public-domain works with an image. */
export async function sampleArtic(n: number, rand = Math.random): Promise<ArchiveItem[]> {
  const page = 1 + Math.floor(rand() * 500);
  const url =
    "https://api.artic.edu/api/v1/artworks/search?" +
    new URLSearchParams({
      "query[term][is_public_domain]": "true",
      fields: "id,title,image_id,is_public_domain",
      limit: "20",
      page: String(page),
    });
  const res = await fetch(url, {
    // AIC asks API users to identify themselves in this header.
    headers: { ...marketHeaders, "AIC-User-Agent": CONTACT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`artic answered ${res.status}`);
  const body = (await res.json()) as {
    data?: { id: number; title?: string; image_id?: string | null; is_public_domain?: boolean }[];
  };
  return (body.data ?? [])
    .filter((a) => a.is_public_domain && a.image_id)
    .slice(0, n)
    .map((a) => ({
      url: `https://www.artic.edu/artworks/${a.id}`,
      title: a.title ?? null,
      imageUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
    }));
}

const MET_QUERIES = ["poster", "print", "typography", "textile", "photograph", "ornament", "drawing", "design"];

/** The Met: a random public-domain object from a design-adjacent search. */
export async function sampleMet(n: number, rand = Math.random): Promise<ArchiveItem[]> {
  const base = "https://collectionapi.metmuseum.org/public/collection/v1";
  const q = MET_QUERIES[Math.floor(rand() * MET_QUERIES.length)];
  const res = await fetch(`${base}/search?hasImages=true&q=${encodeURIComponent(q)}`, {
    headers: marketHeaders,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`met answered ${res.status}`);
  const ids = ((await res.json()) as { objectIDs?: number[] | null }).objectIDs ?? [];
  const out: ArchiveItem[] = [];
  for (let tries = 0; out.length < n && tries < n * 4 && ids.length > 0; tries++) {
    const id = ids[Math.floor(rand() * ids.length)];
    const o = await fetch(`${base}/objects/${id}`, { headers: marketHeaders, signal: AbortSignal.timeout(15000) });
    if (!o.ok) continue;
    const obj = (await o.json()) as {
      isPublicDomain?: boolean; primaryImageSmall?: string; objectURL?: string; title?: string;
    };
    // Only works the Met itself marks public domain; everything else stays out.
    if (!obj.isPublicDomain || !obj.primaryImageSmall || !obj.objectURL) continue;
    out.push({ url: obj.objectURL, title: obj.title ?? null, imageUrl: obj.primaryImageSmall });
  }
  return out;
}
