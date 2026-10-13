import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIp, rule, type AttemptRule, type LimitName } from "@/lib/auth/attempt-rules";

// Counting attempts (rules and reasons: lib/auth/attempt-rules.ts). The
// count lives in Postgres (auth_attempts, take_auth_attempt — see
// scripts/auth-attempts.sql) because serverless functions share no memory.
//
// Fails open: if the count itself can't be read, the attempt goes ahead
// and the error is logged. A database hiccup must never lock every curator
// out; Supabase's own limits still stand behind it.

async function take(r: AttemptRule): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("take_auth_attempt", {
    p_bucket: r.bucket,
    p_max: r.max,
    p_window_seconds: r.windowSeconds,
  });
  if (error) {
    console.error(`[04am] attempt count unavailable: ${error.message}`);
    return true;
  }
  return data !== false;
}

/** True when every rule still has room, counting this attempt against each. */
export async function allowAttempt(rules: AttemptRule[]): Promise<boolean> {
  const results = await Promise.all(rules.map(take));
  return results.every(Boolean);
}

/** The visitor's address, from a route handler's request or a server action. */
export async function requestIp(request?: Request): Promise<string | null> {
  if (request) return clientIp((n) => request.headers.get(n));
  const h = await headers();
  return clientIp((n) => h.get(n));
}

/** Rules for an IP-keyed limit plus, optionally, an email-keyed one. */
export function rulesFor(
  ip: string | null,
  perIp: LimitName,
  email?: { value: string; limit: LimitName }
): AttemptRule[] {
  const out: AttemptRule[] = [];
  if (ip) out.push(rule(perIp, ip));
  if (email) out.push(rule(email.limit, email.value));
  return out;
}
