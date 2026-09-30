import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/clip-session";
import { inbox, markAllRead } from "@/lib/notifications/server";
import { ago, describe } from "@/lib/notifications/copy";
import { SiteHeader } from "@/components/site-header";

// A curator's notifications: follows, likes, public plates and thoughts
// on their clips. Opening the page is reading it — everything shown is
// marked seen, and the ones that were new keep their dot until you leave.
export const dynamic = "force-dynamic";

export const metadata = { title: "Notifications — 04AM" };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=/notifications");

  const rows = await inbox(session.name);
  if (rows && rows.some((r) => r.read_at === null)) await markAllRead(session.name);
  const items = (rows ?? []).map(describe);

  return (
    <>
      <SiteHeader />
      <div className="mx-auto w-full min-w-0 max-w-[720px] px-4 pb-24 sm:px-8">
        <div className="pb-8 pt-11">
          <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bone/75">
            <span aria-hidden className="inline-block h-2.5 w-2.5 flex-none bg-oxide" />
            Notifications
          </p>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">What happened to your work</h1>
        </div>

        {rows === null ? (
          <p className="border-y border-white/10 py-10 text-[14px] text-bone/70">
            Notifications couldn&rsquo;t be loaded just now.
          </p>
        ) : items.length === 0 ? (
          <p className="max-w-md border-y border-white/10 py-10 text-[14px] leading-relaxed text-bone/65">
            Nothing yet. When someone follows you, likes one of your clips, puts one on a public
            plate or shares a thought, it shows up here.
          </p>
        ) : (
          <ul className="divide-y divide-white/[.07] border-y border-white/10">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-4 transition-colors hover:bg-white/[0.02]"
                >
                  <span
                    aria-label={n.unread ? "New" : undefined}
                    className={`mt-[3px] h-[6px] w-[6px] self-center rounded-full ${n.unread ? "bg-oxide" : ""}`}
                  />
                  <span className="min-w-0 text-[14px] leading-relaxed text-bone/80">
                    <span className="font-semibold text-bone">{n.actor ? `@${n.actor}` : "Someone"}</span>{" "}
                    {n.text}
                  </span>
                  <span className="text-[11px] tabular-nums text-bone/45">{ago(n.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
