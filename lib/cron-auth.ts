// The one door for scheduled jobs. Vercel Cron calls with
// `Authorization: Bearer $CRON_SECRET`. This is a machine key, not a
// curator: it never becomes a session and never names anyone, which is
// why it lives apart from lib/clip-session.ts (see lib/auth/auth.test.ts).
//
// Without CRON_SECRET set the answer is always no — the jobs behind this
// spend money, so they are never open by default.

export type CronCheck = { ok: true } | { ok: false; status: 401 | 503; error: string };

export function checkCron(request: Request): CronCheck {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not set." };
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  return { ok: true };
}
