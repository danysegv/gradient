import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ago, describe, type NotificationRow } from "./copy.ts";

const base: NotificationRow = {
  id: "n1", kind: "like", actor_name: "vicmarodin", clip_id: "c1", clip_title: "Olympia 1972",
  board_title: null, board_slug: null, board_owner: null,
  created_at: "2026-09-30T10:00:00Z", read_at: null,
};

test("each kind says what happened and goes to the right place", () => {
  assert.deepEqual(
    [describe(base).text, describe(base).href],
    ["liked “Olympia 1972”", "/clip/c1"]
  );
  assert.equal(describe({ ...base, kind: "follow", clip_id: null }).href, "/curator/vicmarodin");
  const plate = describe({ ...base, kind: "plate", board_title: "Posters", board_slug: "posters", board_owner: "vicmarodin" });
  assert.equal(plate.text, "added “Olympia 1972” to the plate “Posters”");
  assert.equal(plate.href, "/curator/vicmarodin/boards/posters");
  assert.equal(describe({ ...base, kind: "thought" }).href, "/clip/c1#thoughts");
  assert.equal(describe({ ...base, kind: "reply" }).text, "replied to your thought on “Olympia 1972”");
  assert.equal(describe({ ...base, clip_title: null }).text, "liked your clip");
  assert.equal(describe({ ...base, read_at: "2026-09-30T11:00:00Z" }).unread, false);
});

test("time reads short", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  assert.equal(ago("2026-09-30T11:59:30Z", now), "now");
  assert.equal(ago("2026-09-30T11:55:00Z", now), "5m");
  assert.equal(ago("2026-09-30T09:00:00Z", now), "3h");
  assert.equal(ago("2026-09-28T12:00:00Z", now), "2d");
});

const read = (p: string) => readFileSync(p, "utf8");

test("the four events notify, and undoing takes it back", () => {
  const follow = read("app/follow-actions.ts");
  assert.match(follow, /notify\(\{ kind: "follow", actor, recipient: name \}\)/);
  assert.match(follow, /unnotify\(\{ kind: "follow", actor, recipient: name \}\)/);
  const boards = read("app/boards/actions.ts");
  assert.match(boards, /board\.slug === LIKES_SLUG \? "like" : board\.is_public \? "plate" : null/);
  assert.match(boards, /if \(on\) await notify\(n\);\s*else await unnotify\(n\);/);
  const notes = read("app/clip/note-actions.ts");
  assert.match(notes, /kind: "reply"/);
  assert.match(notes, /kind: "thought"/);
});

test("nobody is notified about their own act, and a failed notification fails nothing", () => {
  const server = read("lib/notifications/server.ts");
  assert.match(server, /if \(!recipient \|\| recipient === input\.actor\) return;/);
  assert.equal((server.match(/catch \(err\)/g) ?? []).length, 2);
});

test("the inbox is the signed-in curator's own", () => {
  const page = read("app/notifications/page.tsx");
  assert.match(page, /inbox\(session\.name\)/);
  assert.match(page, /redirect\("\/signin\?next=\/notifications"\)/);
});
