import "server-only";
import { supabasePublic } from "@/lib/supabase/public";

// Reads for boards. Visitors read through the publishable key, where RLS
// returns public boards only. The owner reads through the service role —
// imported lazily, so a public page never needs the service key just to
// render — and only after the caller has established that the signed-in
// curator IS the owner.

export type BoardCover = {
  id: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
};

export type BoardSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_public: boolean;
  updated_at: string;
  clip_count: number;
  covers: BoardCover[];
};

export type BoardClip = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  added_at: string;
  tags: {
    editorial_name: string;
    group: string;
    confidence: number;
    is_published: boolean;
  }[];
};

export type Board = Omit<BoardSummary, "clip_count" | "covers"> & {
  owner_name: string;
  clips: BoardClip[];
};

const COVER_COUNT = 4;

async function clientFor(viewerIsOwner: boolean) {
  if (!viewerIsOwner) return supabasePublic;
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin;
}

// Nested embeds come back as single objects at runtime for to-one
// relations, whatever supabase-js infers without generated types. Same
// gotcha as app/page.tsx — cast at the boundary.
type RawCoverClip = BoardCover & { archived_at: string | null };
type RawSummary = Omit<BoardSummary, "clip_count" | "covers"> & {
  board_clips: { added_at: string; clips: RawCoverClip | null }[] | null;
};

function credit(c: {
  creator?: string | null;
  rights_holder?: string | null;
  source: string | null;
}): string | null {
  return c.creator ?? c.rights_holder ?? c.source ?? null;
}

export async function listBoards(
  owner: string,
  viewerIsOwner: boolean
): Promise<BoardSummary[]> {
  const client = await clientFor(viewerIsOwner);
  let query = client
    .from("boards")
    .select(
      `id, slug, title, description, is_public, updated_at,
       board_clips ( added_at, clips ( id, image_url, title, source, archived_at ) )`
    )
    .eq("owner_name", owner)
    .order("updated_at", { ascending: false });
  if (!viewerIsOwner) query = query.eq("is_public", true);

  const { data, error } = await query;
  if (error) throw new Error(`listBoards(${owner}): ${error.message}`);

  return ((data ?? []) as unknown as RawSummary[]).map(summariseRaw);
}

function summariseRaw(b: RawSummary): BoardSummary {
  // An archived clip leaves the board's count and covers, as it leaves
  // every other surface. The row stays, so restoring the clip restores it.
  const live = (b.board_clips ?? [])
    .filter((bc) => bc.clips && !bc.clips.archived_at)
    .sort((x, y) => y.added_at.localeCompare(x.added_at));
  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    description: b.description,
    is_public: b.is_public,
    updated_at: b.updated_at,
    clip_count: live.length,
    covers: live.slice(0, COVER_COUNT).map((bc) => ({
      id: bc.clips!.id,
      image_url: bc.clips!.image_url,
      title: bc.clips!.title,
      source: bc.clips!.source,
    })),
  };
}

type RawBoardClip = {
  id: string;
  url: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  creator: string | null;
  rights_holder: string | null;
  archived_at: string | null;
  clip_tags:
    | {
        confidence: number | null;
        tags: {
          editorial_name: string;
          group: string;
          published_at: string | null;
        } | null;
      }[]
    | null;
};

type RawBoard = Omit<Board, "clips"> & {
  board_clips: { added_at: string; clips: RawBoardClip | null }[] | null;
};

export async function getBoard(
  owner: string,
  slug: string,
  viewerIsOwner: boolean
): Promise<Board | null> {
  const client = await clientFor(viewerIsOwner);
  let query = client
    .from("boards")
    .select(
      `id, owner_name, slug, title, description, is_public, updated_at,
       board_clips ( added_at, clips ( id, url, image_url, title, source,
         creator, rights_holder, archived_at,
         clip_tags ( confidence, tags ( editorial_name, group, published_at ) ) ) )`
    )
    .eq("owner_name", owner)
    .eq("slug", slug);
  if (!viewerIsOwner) query = query.eq("is_public", true);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`getBoard(${owner}/${slug}): ${error.message}`);
  if (!data) return null;

  const b = data as unknown as RawBoard;
  const clips: BoardClip[] = (b.board_clips ?? [])
    .filter((bc) => bc.clips && !bc.clips.archived_at)
    .sort((x, y) => y.added_at.localeCompare(x.added_at))
    .map((bc) => {
      const c = bc.clips!;
      return {
        id: c.id,
        url: c.url,
        image_url: c.image_url,
        title: c.title,
        source: credit(c),
        added_at: bc.added_at,
        tags: (c.clip_tags ?? [])
          .filter((ct) => ct.tags !== null)
          .map((ct) => ({
            editorial_name: ct.tags!.editorial_name,
            group: ct.tags!.group,
            confidence: ct.confidence ?? 0,
            is_published: ct.tags!.published_at !== null,
          })),
      };
    });

  return {
    id: b.id,
    owner_name: b.owner_name,
    slug: b.slug,
    title: b.title,
    description: b.description,
    is_public: b.is_public,
    updated_at: b.updated_at,
    clips,
  };
}

export type BoardChoice = {
  id: string;
  title: string;
  is_public: boolean;
  has: boolean;
};

/** The owner's boards, each marked with whether it holds this clip. */
export async function boardChoicesForClip(
  owner: string,
  clipId: string
): Promise<BoardChoice[]> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { data: boards, error } = await supabaseAdmin
    .from("boards")
    .select("id, title, is_public")
    .eq("owner_name", owner)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`boardChoicesForClip: ${error.message}`);
  const rows = (boards ?? []) as { id: string; title: string; is_public: boolean }[];
  if (rows.length === 0) return [];

  const { data: links, error: linkError } = await supabaseAdmin
    .from("board_clips")
    .select("board_id")
    .eq("clip_id", clipId)
    .in(
      "board_id",
      rows.map((r) => r.id)
    );
  if (linkError) throw new Error(`boardChoicesForClip: ${linkError.message}`);
  const on = new Set(((links ?? []) as { board_id: string }[]).map((l) => l.board_id));
  return rows.map((r) => ({ ...r, has: on.has(r.id) }));
}

export type PublicBoardLink = { owner_name: string; slug: string; title: string };

/** Public boards this clip is on — what a visitor sees under "On boards". */
export async function publicBoardsForClip(
  clipId: string
): Promise<PublicBoardLink[]> {
  const { data, error } = await supabasePublic
    .from("board_clips")
    .select("boards ( owner_name, slug, title, is_public )")
    .eq("clip_id", clipId);
  if (error) throw new Error(`publicBoardsForClip: ${error.message}`);
  return (
    (data ?? []) as unknown as {
      boards: (PublicBoardLink & { is_public: boolean }) | null;
    }[]
  )
    .map((r) => r.boards)
    .filter((b): b is PublicBoardLink & { is_public: boolean } => !!b && b.is_public)
    .map(({ owner_name, slug, title }) => ({ owner_name, slug, title }));
}

export function boardHref(owner: string, slug: string): string {
  return `/curator/${encodeURIComponent(owner)}/boards/${encodeURIComponent(slug)}`;
}

type PresenceRow = {
  editorial_name: string;
  group: string;
  clips: number | string;
  classified_clips: number | string;
};

/**
 * Library-wide presence of each published tag, for the board radar's "vs
 * library" comparison. PostgREST serialises bigint as a string — Number()
 * once, here at the boundary.
 */
export async function getLibraryPresence(minConfidence: number) {
  const { data, error } = await supabasePublic.rpc("tag_clip_presence", {
    min_confidence: minConfidence,
  });
  if (error) throw new Error(`tag_clip_presence: ${error.message}`);
  const rows = (data ?? []) as PresenceRow[];
  return {
    classifiedClips: rows.length ? Number(rows[0].classified_clips) : 0,
    tags: rows.map((r) => ({
      name: r.editorial_name,
      group: r.group,
      clips: Number(r.clips),
    })),
  };
}

export type BoardHit = BoardSummary & { owner_name: string };

/**
 * Boards whose title or description match. Visitors get public boards;
 * a signed-in curator also gets their own private ones. scopeOwner keeps
 * results to one profile.
 */
export async function searchBoards(
  q: string,
  opts: { viewer: string | null; scopeOwner?: string }
): Promise<BoardHit[]> {
  if (!q) return [];
  const client = await clientFor(opts.viewer !== null);
  const { data, error } = await client.rpc("search_boards", {
    q,
    viewer_name: opts.viewer,
    scope_owner: opts.scopeOwner ?? null,
  });
  if (error) throw new Error(`search_boards: ${error.message}`);
  const ids = ((data ?? []) as { board_id: string }[]).map((r) => r.board_id);
  if (ids.length === 0) return [];

  // Ids came from a query already limited to public boards plus the
  // viewer's own, so reading their covers with the same client is safe.
  const { data: rows, error: rowsError } = await client
    .from("boards")
    .select(
      `id, owner_name, slug, title, description, is_public, updated_at,
       board_clips ( added_at, clips ( id, image_url, title, source, archived_at ) )`
    )
    .in("id", ids);
  if (rowsError) throw new Error(`searchBoards: ${rowsError.message}`);

  const position = new Map(ids.map((id, i) => [id, i]));
  return ((rows ?? []) as unknown as (RawSummary & { owner_name: string })[])
    .sort((a, b) => position.get(a.id)! - position.get(b.id)!)
    .map((b) => ({ ...summariseRaw(b), owner_name: b.owner_name }));
}
