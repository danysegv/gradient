"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addNote, deleteNote } from "@/app/clip/note-actions";

type Note = { id: string; parent_id: string | null; author_name: string; body: string; created_at: string };

// Thoughts, kept quiet on purpose (Daniela, 2026-09-25): small type, no
// avatars, no counts. A line to write in, underlined only, Enter to leave
// it. Each thought can be answered once-deep — Reply opens the same quiet
// line under it, and replies sit indented beneath. Hidden entirely when
// there is nothing to show and nobody who could write.

const INPUT =
  "w-full border-0 border-b border-white/15 bg-transparent px-0 py-1.5 text-[13px] text-bone placeholder:text-bone/35 focus:border-bone/60 focus:outline-none focus:ring-0";

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ClipNotes({
  clipId,
  notes,
  viewer,
  clipCurator,
  isAdmin,
}: {
  clipId: string;
  notes: Note[];
  /** The signed-in curator's username, or null. */
  viewer: string | null;
  clipCurator: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (notes.length === 0 && !viewer) return null;

  const top = notes.filter((n) => n.parent_id === null);
  const replies = new Map<string, Note[]>();
  for (const n of notes) {
    if (!n.parent_id) continue;
    replies.set(n.parent_id, [...(replies.get(n.parent_id) ?? []), n]);
  }

  function post(body: string, parentId: string | null, done: () => void) {
    const clean = body.trim();
    if (!clean) return;
    setError(null);
    start(async () => {
      const res = await addNote(clipId, clean, parentId);
      if ("error" in res) {
        setError(res.error === "signin" ? "Sign in as a curator to share a thought." : res.error);
        return;
      }
      done();
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteNote(id);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  const canRemove = (n: Note) => !!viewer && (viewer === n.author_name || viewer === clipCurator || isAdmin);

  function Byline({ n, thread }: { n: Note; thread: string }) {
    return (
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-bone/45">
        <Link href={`/curator/${encodeURIComponent(n.author_name)}`} className="hover:text-bone/80">
          @{n.author_name}
        </Link>
        <span>{when(n.created_at)}</span>
        {viewer && (
          <button
            type="button"
            onClick={() => {
              setReplyTo(replyTo === thread ? null : thread);
              setReplyText("");
            }}
            className="hover:text-bone/80"
          >
            Reply
          </button>
        )}
        {canRemove(n) && (
          <button
            type="button"
            onClick={() => remove(n.id)}
            disabled={pending}
            className="opacity-0 transition-opacity hover:text-bone/80 focus-visible:opacity-100 group-hover:opacity-100"
          >
            Remove
          </button>
        )}
      </p>
    );
  }

  return (
    <section className="mt-8 border-t border-white/10 pt-5">
      <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-wide text-bone/70">Thoughts</h2>
      {top.length > 0 && (
        <ul className="mb-4 flex flex-col gap-4">
          {top.map((n) => (
            <li key={n.id}>
              <div className="group text-[13px] leading-relaxed">
                <p className="whitespace-pre-line text-bone/85">{n.body}</p>
                <Byline n={n} thread={n.id} />
              </div>

              {(replies.get(n.id)?.length || replyTo === n.id) && (
                <div className="mt-2.5 flex flex-col gap-2.5 border-l border-white/10 pl-3.5">
                  {(replies.get(n.id) ?? []).map((r) => (
                    <div key={r.id} className="group text-[13px] leading-relaxed">
                      <p className="whitespace-pre-line text-bone/80">{r.body}</p>
                      <Byline n={r} thread={n.id} />
                    </div>
                  ))}
                  {replyTo === n.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        post(replyText, n.id, () => {
                          setReplyText("");
                          setReplyTo(null);
                        });
                      }}
                    >
                      <label htmlFor={`reply-${n.id}`} className="sr-only">
                        Reply to @{n.author_name}
                      </label>
                      <input
                        id={`reply-${n.id}`}
                        autoFocus
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setReplyTo(null)}
                        maxLength={500}
                        disabled={pending}
                        placeholder={`Reply to @${n.author_name}`}
                        className={INPUT}
                      />
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {viewer && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            post(text, null, () => setText(""));
          }}
        >
          <label htmlFor="clip-thought" className="sr-only">Share a thought</label>
          <input
            id="clip-thought"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            disabled={pending}
            placeholder="Share a thought"
            className={INPUT}
          />
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-[12px] text-bone/70">{error}</p>}
    </section>
  );
}
