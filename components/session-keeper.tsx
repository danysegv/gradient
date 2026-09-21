"use client";

import { useEffect } from "react";
import { authBrowserClient } from "@/lib/supabase/auth-browser";

// Keeps a visitor's session alive. Server components can't write cookies,
// and the proxy's matcher must stay exactly ["/clip"], so the refresh that
// would usually happen in middleware happens here instead: the browser
// client refreshes the access token before it expires and writes the new
// cookies back. Renders nothing.
export function SessionKeeper() {
  useEffect(() => {
    const supabase = authBrowserClient();
    // Touching the session is what starts the auto-refresh timer.
    void supabase.auth.getSession();
    const { data } = supabase.auth.onAuthStateChange(() => {});
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
