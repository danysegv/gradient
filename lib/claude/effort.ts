// Which models accept output_config.effort.
//
// Haiku 4.5 rejects it with a 400, and so does every model older than
// Opus 4.5. The classifier sends effort "low", so before this file existed
// setting CLASSIFIER_MODEL=claude-haiku-4-5 would have failed every single
// classification: the cheap path was switched off AND broken, and nothing
// would have said so until the first clip after the flip.
//
// An allowlist, not a denylist. A model missing from it gets no effort
// parameter, which costs more tokens but can never 400. The opposite
// mistake takes the product down.
//
// Only models this repo prices are listed (pricing.test.ts fails on any
// model string without a price). Add one here when it is added to PRICES.
const ACCEPTS_EFFORT = ["claude-opus-5"];

export function acceptsEffort(model: string): boolean {
  return ACCEPTS_EFFORT.some((m) => model === m || model.startsWith(`${m}-`));
}

/** Spread into output_config: `{ ...effortFor(model, "low"), format }`. */
export function effortFor<E extends "low" | "medium" | "high">(
  model: string,
  effort: E
): { effort: E } | Record<string, never> {
  return acceptsEffort(model) ? { effort } : {};
}
