"use server";

import { getSessionCurator } from "@/lib/clip-session";
import { unreadCount } from "@/lib/notifications/server";

/**
 * For the header bell. `curator` is false for visitors and signed-in
 * accounts that aren't curators — they have no name to be notified by, so
 * they get no bell.
 */
export async function myNotifications(): Promise<{ curator: boolean; unread: number }> {
  const name = await getSessionCurator();
  if (!name) return { curator: false, unread: 0 };
  try {
    return { curator: true, unread: await unreadCount(name) };
  } catch {
    return { curator: true, unread: 0 };
  }
}
