import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { assertWithinBudget, recordSpend } from "./spend.ts";
import { currentSpendContext } from "./spend-context.ts";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("Missing ANTHROPIC_API_KEY environment variable");
}

const client = new Anthropic({ apiKey });

// Every call this app makes goes through messages.parse, so metering it
// here meters all of them — the classifier, the describer, the colour
// estimate and the attribution backfill — and any call site added later
// is metered the day it is written rather than the day someone remembers.
//
// WRAPPED HERE AND NOT AT THE CALL SITES, for two reasons.
//
// The classifier is frozen until 2026-09-26: its prompt and the image it
// receives are the measuring instrument for the launch board, and editing
// that file to add bookkeeping is exactly the kind of "harmless" change
// that turns out not to be. Nothing about the request changes here. The
// budget check happens strictly BEFORE the call and the ledger write
// strictly after, so a clip classified through this wrapper gets the same
// tags it would have got without it.
//
// The other reason is that four hand-written meters drift. There were
// already two copies of the cost arithmetic, in classify-clip.ts and
// describe-clip.ts, with the rates inlined as bare numbers — both correct,
// both writing to console.log, where Vercel discards them. One wrapper and
// one price table cannot disagree with themselves.
//
// `kind` is taken from the model plus the caller's own label where one is
// passed; absent that, the model alone. It is only ever used to group rows
// in a report, never to price them.
type ParseArgs = Parameters<typeof client.messages.parse>;

// The cast below is load-bearing. messages.parse is generic over the zod
// schema it's given — that generic is what types response.parsed_output at
// every call site. Wrapping it with a plain async function erases the
// generic and every caller silently degrades to `never`, which the build
// catches now but would be an awkward thing to discover later. The
// implementation takes the erased parameter types; the export re-asserts
// the original signature, so callers see exactly what they saw before.
async function meteredParse(...args: ParseArgs) {
  const [body] = args;
  const model = String((body as { model?: unknown }).model ?? "unknown");

  // Before, not after: over budget, no tokens are spent at all.
  await assertWithinBudget();

  const response = await client.messages.parse(...args);

  // Deliberately awaited rather than fired and forgotten. A serverless
  // function can be frozen the instant its handler resolves, which would
  // drop the row — silently, and only under load, which is the exact
  // condition where knowing the spend matters most. recordSpend never
  // throws, so this cannot fail the call.
  // Who the call was for comes from the caller's spend context
  // (lib/claude/spend-context.ts). Outside one, the row is still written,
  // labelled by model with no clip — an unattributed row, never a lost one.
  const ctx = currentSpendContext();
  await recordSpend({
    model,
    kind: ctx?.kind ?? model,
    clipId: ctx?.clipId ?? null,
    usage: response.usage,
  });

  return response;
}

export const anthropic = {
  messages: {
    parse: meteredParse as unknown as typeof client.messages.parse,
  },
  /** Escape hatch for anything the wrapper doesn't cover yet. Unmetered — prefer messages.parse. */
  raw: client,
};
