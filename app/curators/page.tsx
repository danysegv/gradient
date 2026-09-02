import Link from "next/link";
import { supabasePublic } from "@/lib/supabase/public";
import {
  panelCompositionFromCounts,
  MAX_PANEL_DRIFT,
} from "@/lib/curator-velocity";
import { RECENT_WINDOW_DAYS } from "@/lib/velocity";
import { Wordmark } from "@/components/wordmark";
import { ClipThumbnail } from "@/components/clip-thumbnail";

export const revalidate = 0;

export const metadata = {
  title: "Curators — 04AM",
  // Same pending decision as /curator/[name], /trend/[name] and
  // /clip/[id]: this page is a roster of real people by name. It becomes
  // indexable the moment curator identity is settled as public.
  robots: { index: false, follow: false },
};

// Thumbnails per curator on the roster. One query fetches the pool for
// everyone and groups in JS — N+1 queries would scale with the panel,
// which is the thing this page exists to grow.
const STRIP = 5;
const STRIP_POOL = 200;

type CompositionRow = {
  curator: string;
  base_count: number | string;
  recent_count: number | string;
};

type StatsRow = {
  curator: string | null;
  total_clips: number | string;
  classified_clips: number | string;
  first_clipped_at: string | null;
};

type StripClip = {
  id: string;
  image_url: string | null;
  title: string | null;
  source: string | null;
  clipped_by_name: string | null;
};

function formatSince(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function CuratorsPage() {
  const { data: compRaw } = await supabasePublic.rpc("curator_composition", {
    window_days: RECENT_WINDOW_DAYS,
  });

  // PostgREST serialises bigint as a JSON string — coerce once, here.
  const composition = ((compRaw ?? []) as unknown as CompositionRow[]).map(
    (c) => ({
      curator: c.curator,
      base: Number(c.base_count),
      recent: Number(c.recent_count),
    })
  );

  const panel = panelCompositionFromCounts(composition);
  const names = composition.map((c) => c.curator);

  const [statsResults, stripRes] = await Promise.all([
    Promise.all(
      names.map((n) =>
        supabasePublic
          .rpc("curator_clip_stats", { curator_name: n })
          .single()
      )
    ),
    names.length > 0
      ? supabasePublic
          .from("clips")
          .select("id, image_url, title, source, clipped_by_name")
          .in("clipped_by_name", names)
          .is("archived_at", null)
          .not("image_url", "is", null)
          .order("clipped_at", { ascending: false })
          .limit(STRIP_POOL)
      : Promise.resolve({ data: [] as StripClip[] }),
  ]);

  const statsByName = new Map<string, StatsRow>();
  for (const r of statsResults) {
    const row = r.data as unknown as StatsRow | null;
    if (row?.curator) statsByName.set(row.curator, row);
  }

  const stripByName = new Map<string, StripClip[]>();
  for (const c of (stripRes.data ?? []) as unknown as StripClip[]) {
    if (!c.clipped_by_name) continue;
    const list = stripByName.get(c.clipped_by_name) ?? [];
    if (list.length < STRIP) list.push(c);
    stripByName.set(c.clipped_by_name, list);
  }

  const roster = composition
    .map((c) => {
      const stats = statsByName.get(c.curator);
      return {
        name: c.curator,
        applications: c.base,
        clips: stats ? Number(stats.total_clips) : 0,
        since: formatSince(stats?.first_clipped_at ?? null),
        share:
          panel.baseTotal === 0
            ? 0
            : Math.round((c.base / panel.baseTotal) * 100),
        strip: stripByName.get(c.curator) ?? [],
      };
    })
    .sort((a, b) => b.applications - a.applications);

  // Drift is a comparison between the trailing window's curator mix and
  // the all-time mix. While the window still covers the entire library
  // those two sets are the same rows, so the figure is 0.0% by
  // construction and says nothing. Reporting it as "the panel is
  // balanced" was logged as a mistake on 2026-09-01 — so the page checks
  // for the degenerate case and says what is actually true instead.
  const driftIsMeaningful = panel.recentTotal < panel.baseTotal;

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
          <span className="text-[13px] font-semibold uppercase tracking-wide text-bone">
            Curators
          </span>
          <Link
            href="/genome"
            className="text-[13px] font-semibold uppercase tracking-wide text-bone/55"
          >
            Genome
          </Link>
          <Link
            href="/clip"
            className="rounded bg-oxide px-4 py-2 text-[13px] font-semibold tracking-wide text-bone"
          >
            + Clip
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-8 pb-24">
        <div className="pt-11 pb-2">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 flex-none bg-oxide"
            />
            The panel — live from the library
          </p>
          <h1 className="mb-2.5 text-[34px] font-bold leading-tight tracking-tight">
            Curators
          </h1>
          <p className="mb-9 max-w-xl text-[15px] leading-relaxed text-bone/75">
            04AM measures what working creatives chose to keep as reference.
            That makes the panel the instrument, not the audience — every
            figure on the Signals Feed is only as honest as the mix of people
            behind it.
          </p>
        </div>

        <dl className="mb-12 flex flex-wrap gap-x-14 gap-y-6 border-y border-white/10 py-6">
          <div>
            <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
              Curators
            </dt>
            <dd className="text-[26px] font-normal leading-none">
              {panel.curatorCount}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
              Tag applications
            </dt>
            <dd className="text-[26px] font-normal leading-none">
              {panel.baseTotal}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
              Panel drift
            </dt>
            <dd className="text-[26px] font-normal leading-none">
              {driftIsMeaningful
                ? `${(panel.drift * 100).toFixed(1)}%`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
              Gate
            </dt>
            <dd className="flex items-center gap-2 text-[15px] font-semibold leading-none">
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 flex-none ${
                  !driftIsMeaningful
                    ? "bg-slate"
                    : panel.safeForGlobalVelocity
                      ? "bg-bone"
                      : "bg-oxide"
                }`}
              />
              {!driftIsMeaningful
                ? "Not yet readable"
                : panel.safeForGlobalVelocity
                  ? "Global number publishable"
                  : "Global number withheld"}
            </dd>
          </div>
        </dl>

        <p className="mb-12 max-w-xl text-xs leading-relaxed text-bone/70">
          {driftIsMeaningful ? (
            <>
              Drift is the share of the trailing {RECENT_WINDOW_DAYS} days
              that would have to be reassigned to a different curator for the
              window to match the library&rsquo;s all-time mix. Above{" "}
              {(MAX_PANEL_DRIFT * 100).toFixed(0)}% the Signals Feed withholds
              its global velocity figures, because at that point the board
              would be describing a change in who is clipping rather than a
              change in what is being clipped.
            </>
          ) : (
            <>
              Drift cannot be read yet. The trailing{" "}
              {RECENT_WINDOW_DAYS}-day window still covers the entire library,
              so the recent mix and the all-time mix are the same rows and the
              figure is zero by construction &mdash; not because the panel is
              balanced. It becomes meaningful once the earliest clips age out
              of the window.
            </>
          )}
        </p>

        <p className="mb-3.5 text-xs font-semibold uppercase tracking-wide text-bone/70">
          The roster
        </p>
        <div className="flex flex-col">
          {roster.map((c) => (
            <Link
              key={c.name}
              href={`/curator/${encodeURIComponent(c.name)}`}
              className="group grid gap-6 border-t border-white/10 py-7 transition-colors hover:bg-ink-2 lg:grid-cols-[260px_1fr]"
            >
              <div>
                <p className="text-[21px] font-bold leading-tight tracking-tight">
                  {c.name}
                </p>
                <p className="mt-1 text-xs text-bone/70">
                  Clipping since {c.since}
                </p>
                <dl className="mt-4 flex gap-7">
                  {[
                    { k: "Clips", v: String(c.clips) },
                    { k: "Tag apps", v: String(c.applications) },
                    { k: "Share", v: `${c.share}%` },
                  ].map(({ k, v }) => (
                    <div key={k}>
                      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-bone/70">
                        {k}
                      </dt>
                      <dd className="text-[17px] font-normal leading-none tabular-nums">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="grid grid-cols-5 gap-2 self-start">
                {c.strip.map((clip) => (
                  <div
                    key={clip.id}
                    className="overflow-hidden rounded-[3px] bg-ink-2"
                  >
                    <ClipThumbnail
                      imageUrl={clip.image_url}
                      title={clip.title}
                      source={clip.source}
                    />
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-14 border-t border-white/10 py-10">
          <p className="max-w-xl text-xs leading-relaxed text-bone/70">
            A two-person panel is two people. The velocity figures on the
            Signals Feed describe a culture only to the degree that the panel
            behind them does &mdash; which is why recruiting curators is a
            measurement decision before it is a growth one.
          </p>
        </footer>
      </div>
    </>
  );
}
