import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Publishable key — safe in a browser bundle, subject to RLS. This is what
// public pages (Signals Feed) read through, now that anon SELECT policies
// exist on clips/clip_tags/tags. Never use this for writes.
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);
