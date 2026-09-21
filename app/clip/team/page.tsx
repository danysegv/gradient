import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/clip-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SiteHeader } from "@/components/site-header";
import { ApproveForm } from "./approve-form";

// The curator panel: who can clip, and approving new curators. Admins only.
// Not covered by proxy.ts (its matcher is exactly "/clip"), so this page
// checks the session itself — and 404s for everyone else, so it doesn't
// advertise that it exists.
export const revalidate = 0;

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=/clip/team");
  if (!session.isAdmin) notFound();

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("name, display_name, user_id, is_admin")
    .order("name");
  const curators = (data ?? []) as {
    name: string;
    display_name: string | null;
    user_id: string | null;
    is_admin: boolean;
  }[];

  return (
    <>
      <SiteHeader active="clip" />
      <div className="mx-auto w-full max-w-[860px] px-4 py-12 sm:px-8">
        <h1 className="mb-10 text-[30px] font-bold tracking-tight md:text-[40px]">Curators</h1>

        <section className="mb-14">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            Approve an account
          </p>
          <ApproveForm />
        </section>

        <section>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            Everyone who can clip
          </p>
          <ul className="border-t border-white/10">
            {curators.map((c) => (
              <li key={c.name} className="flex items-baseline justify-between gap-4 border-b border-white/10 py-4">
                <span>
                  <span className="text-[15px] font-semibold">{c.display_name ?? c.name}</span>
                  <span className="ml-2 text-[13px] text-bone/55">@{c.name}</span>
                  {c.is_admin && <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-bone/45">admin</span>}
                </span>
                <span className={`text-[12px] ${c.user_id ? "text-bone/70" : "text-bone/45"}`}>
                  {c.user_id ? "Account linked" : "Old password only"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
