"use client";

import { useEffect, useRef, useState } from "react";
import { authBrowserClient } from "@/lib/supabase/auth-browser";
import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { myProfileHref } from "@/app/account-actions";

// A signed-in visitor's mark in the header: the first letter of their email
// in a small circle, opening to their address and "Sign out". Signed out,
// it renders nothing, so the bar stays as simple as the design asks.
// A curator also gets "My profile" (Daniela, 2026-09-25), so their own
// page is one click from anywhere instead of a hunt through Curators.
export function AccountButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = authBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setEmail(session?.user?.email ?? null)
    );
    return () => data.subscription.unsubscribe();
  }, []);

  // Asked once there is someone signed in; a failed lookup just leaves the
  // link out rather than breaking the menu.
  useEffect(() => {
    if (!email) return;
    let live = true;
    myProfileHref()
      .then((href) => live && setProfile(href))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [email]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!email) return null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bone text-[12px] font-semibold uppercase text-ink">
          {email[0]}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-[6px] border border-white/10 bg-ink-2 p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] [animation:drop-in_200ms_cubic-bezier(.2,.8,.2,1)]">
          <p className="truncate text-[13px] text-bone/70">{email}</p>
          {profile && (
            <Link
              href={profile}
              onClick={() => setOpen(false)}
              className="mt-3 block border-t border-white/10 pt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-bone hover:text-bone/70"
            >
              My profile
            </Link>
          )}
          <form action={signOut} className="mt-3 border-t border-white/10 pt-3">
            <button
              type="submit"
              className="text-[12px] font-semibold uppercase tracking-[0.08em] text-bone hover:text-bone/70"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
