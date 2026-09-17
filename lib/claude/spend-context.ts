import { AsyncLocalStorage } from "node:async_hooks";

// Which clip, and which job, a Claude call is being made for.
//
// api_spend has clip_id and kind columns, but the meter in admin.ts wraps
// messages.parse and cannot see either: by the time a request reaches it,
// it is a model name and some tokens. So until 2026-09-17 every ledger row
// had clip_id NULL and kind = the model name, and "what does a clip cost"
// or "classify vs describe" could not be answered from the ledger at all.
//
// A context rather than a parameter, for the same reason the meter is a
// wrapper: the classifier (lib/claude/classify-clip.ts) is the launch
// board's measuring instrument, and threading a clip id through its
// request path is exactly the "harmless" edit that file must not get. The
// caller sets the context around the call; the request is byte-for-byte
// what it was.
//
// Relative imports with .ts extensions: scripts run under plain Node.

export type SpendKind =
  | "classify-full"
  | "classify-incubating"
  | "describe"
  | "color"
  | "attribution";

export type SpendContext = { clipId: string | null; kind: SpendKind };

const storage = new AsyncLocalStorage<SpendContext>();

/** Run `fn` with every metered Claude call inside it attributed to `ctx`. */
export function withSpendContext<T>(ctx: SpendContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentSpendContext(): SpendContext | undefined {
  return storage.getStore();
}
