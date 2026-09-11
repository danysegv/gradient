import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { HomeGrid, type FilterTag, type GridClip } from "@/components/home-grid";
import { BoardOwnerControls } from "@/components/boards/board-owner-controls";
import { BoardRadar } from "@/components/boards/board-radar";
import { computeBoardRadar, PRESENCE_CONFIDENCE } from "@/lib/boards/radar";
import { getSessionCurator } from "@/lib/clip-session";
import { getBoard, getLibraryPresence } from "@/lib/boards/queries";
import { SLUG_PATTERN } from "@/lib/boards/slug";

// A board: the clips someone gathered for one project, from anywhere in
// the library. Filtering works exactly as it does on the library — the
// same facets, scoped to this board. Each clip keeps its own tags and its
// own credit; the board adds only a title, a description and a grouping.
export const revalidate = 0;

async function resolve(params: Promise<{ name: string; slug: string }>) {
  const { name, slug } = await params;
  const owner = decodeURIComponent(name).toLowerCase();
  const boardSlug = decodeURIComponent(slug);
  if (!SLUG_PATTERN.test(boardSlug)) return null;
  const viewer = await getSessionCurator();
  const isOwner = viewer === owner;
  const board = await getBoard(owner, boardSlug, isOwner);
  return board ? { board, isOwner } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string; slug: string }>;
}) {
  const found = await resolve(params);
  if (!found) return { title: "Not found — 04AM" };
  const { board } = found;
  return {
    title: `${board.title} — ${board.owner_name} — 04AM`,
    description: board.description ?? undefined,
    // A private board is only ever rendered for its owner; keep it out of
    // any index regardless.
    robots: board.is_public ? undefined : { index: false, follow: false },
  };
}

export default async function BoardPage({
  params,
}: {
  params: Promise<{ name: string; slug: string }>;
}) {
  const found = await resolve(params);
  // A private board 404s for everyone but its owner — the same response as
  // a board that doesn't exist, so a URL can't confirm a private board is there.
  if (!found) notFound();
  const { board, isOwner } = found;

  const gridClips: GridClip[] = board.clips.map((c) => ({
    id: c.id,
    url: c.url,
    image_url: c.image_url,
    title: c.title,
    source: c.source,
    tags: c.tags.map((t) => ({
      editorial_name: t.editorial_name,
      confidence: t.confidence,
    })),
  }));

  const seen = new Map<string, FilterTag>();
  for (const c of board.clips) {
    for (const t of c.tags) {
      if (!seen.has(t.editorial_name)) {
        seen.set(t.editorial_name, {
          tag_id: t.editorial_name,
          group: t.group,
          editorial_name: t.editorial_name,
        });
      }
    }
  }
  const filterTags = [...seen.values()].sort((a, b) =>
    a.editorial_name.localeCompare(b.editorial_name)
  );

  // The board radar: this board's make-up against the library's. Its own
  // reading, computed here, sharing nothing with the Signals radar.
  const radar =
    board.clips.length > 0
      ? computeBoardRadar(
          board.clips.map((c) => ({
            tags: c.tags.map((t) => ({
              name: t.editorial_name,
              group: t.group,
              confidence: t.confidence,
              isPublished: t.is_published,
            })),
          })),
          await getLibraryPresence(PRESENCE_CONFIDENCE)
        )
      : null;

  const updated = new Date(board.updated_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const profileHref = `/curator/${encodeURIComponent(board.owner_name)}`;

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-7">
        <Link href="/" aria-label="04AM — Signals Feed">
          <Wordmark className="h-[22px] text-bone" />
        </Link>
        <nav className="flex items-center gap-7">
          <Link
            href="/"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Signals
          </Link>
          <Link
            href="/curators"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Curators
          </Link>
          <Link
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8">
        <div className="pt-7">
          <Link
            href={profileHref}
            className="text-[11px] font-semibold uppercase tracking-wide text-bone/70 hover:text-bone"
          >
            ← {board.owner_name}
          </Link>
        </div>

        <div className="pt-8 pb-10">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-bone" />
            {board.is_public ? "Board" : "Private board — only you can see it"}
          </p>
          <h1 className="mb-3 max-w-3xl text-[34px] font-bold leading-tight tracking-tight [text-wrap:balance]">
            {board.title}
          </h1>
          {board.description && (
            <p className="mb-4 max-w-xl whitespace-pre-line text-[15px] leading-relaxed text-bone/75">
              {board.description}
            </p>
          )}
          <p className="text-[12px] text-bone/65">
            <span className="font-normal tabular-nums">{board.clips.length}</span>{" "}
            {board.clips.length === 1 ? "clip" : "clips"} ·{" "}
            <Link
              href={profileHref}
              className="underline decoration-white/30 underline-offset-4 hover:decoration-bone"
            >
              {board.owner_name}
            </Link>{" "}
            · updated {updated}
          </p>

          {isOwner && (
            <BoardOwnerControls
              board={{
                id: board.id,
                title: board.title,
                description: board.description,
                is_public: board.is_public,
                clipCount: board.clips.length,
              }}
            />
          )}
        </div>
      </div>

      {radar && radar.tags.length > 0 && (
        <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8">
          <BoardRadar radar={radar} />
        </div>
      )}

      {board.clips.length === 0 ? (
        <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 pb-24">
          <p className="max-w-md border-t border-white/10 pt-6 text-[14px] leading-relaxed text-bone/70">
            {isOwner ? (
              <>
                Nothing here yet. Open any clip, from the{" "}
                <Link href="/" className="underline underline-offset-4 hover:text-bone">
                  library
                </Link>{" "}
                or a curator&rsquo;s page, and tick this board under
                &ldquo;Save to your boards&rdquo;.
              </>
            ) : (
              "This board has no clips yet."
            )}
          </p>
        </div>
      ) : (
        <HomeGrid
          clips={gridClips}
          filterTags={filterTags}
          searchLabel="Search this board"
        />
      )}
    </>
  );
}
