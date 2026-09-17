import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const EVAL = "scripts/classifier-eval.ts";
const CLASSIFIER = "lib/claude/classify-clip.ts";

test("the eval harness never writes", () => {
  // The whole point of it is that it can be run at any time, including
  // during the freeze, without moving a single figure. One stray .upsert
  // and it becomes a second classifier writing tags nobody reviewed.
  //
  // Scoped to what follows each supabaseAdmin call rather than to the
  // whole file: crypto's createHash().update() is not a database write,
  // and a test that cannot tell the difference gets disabled the first
  // time it cries wolf.
  const src = readFileSync(EVAL, "utf8");
  // .from( specifically, so the import line isn't mistaken for a query.
  const chains = [...src.matchAll(/supabaseAdmin\s*\.from\(([\s\S]{0,400})/g)];
  assert.ok(chains.length > 0, `${EVAL} runs no supabaseAdmin query at all`);
  for (const [, chain] of chains) {
    const upTo = chain.split(";")[0];
    for (const verb of ["insert", "upsert", "delete", "rpc"]) {
      assert.equal(
        new RegExp(`\\.${verb}\\s*\\(`).test(upTo),
        false,
        `${EVAL} calls .${verb}() on supabaseAdmin — it must only read`
      );
    }
    assert.equal(
      /\.update\s*\(/.test(upTo),
      false,
      `${EVAL} calls .update() on supabaseAdmin — it must only read`
    );
    assert.match(upTo, /\.select\s*\(/, `${EVAL}: a supabaseAdmin chain that does not select`);
  }
});

test("the eval prompt has not drifted from the classifier's", () => {
  // scripts/local-classify-eval.ts holds a COPY of the taxonomy prompt,
  // because extracting a shared builder would mean editing the frozen
  // classifier. A copy that drifts measures a different instrument than
  // the one in production, and the agreement number becomes meaningless
  // without anyone noticing — which is worse than no number.
  //
  // After 2026-09-26: extract lib/claude/taxonomy-prompt.ts, have both
  // import it, and replace this test with one that checks there is only
  // one copy.
  const shared =
    "You are classifying a design reference image against 04AM's taxonomy — " +
    "a faceted system across ${axisCount} axes (${axes.join(\", \")}). A single " +
    "image can carry a tag from every axis at once, or none from a given axis " +
    "if nothing genuinely fits. For each axis, pick at most the single " +
    "best-matching tag — never force a weak match. Rate your confidence in " +
    "each tag from 0 to 1, calibrated to how clearly the image exhibits it.";

  for (const f of [EVAL, CLASSIFIER]) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      src.includes(shared),
      `${f} no longer contains the shared taxonomy prompt verbatim — ` +
        `re-sync the copy in ${EVAL}, or the eval measures a prompt that is ` +
        `not the one in production`
    );
  }

  // Same taxonomy rendering, so a tag reads identically to both models.
  const line = '`- ${t.editorial_name} (${t.group}, aka "${t.universal_term}"): ${t.description}`';
  for (const f of [EVAL, CLASSIFIER]) {
    assert.ok(readFileSync(f, "utf8").includes(line), `${f} renders tags differently`);
  }
});

test("the eval excludes format_motion, exactly as the classifier does", () => {
  // v1 scope decision: MotionLoop/StoryScroll are applied by hand. An eval
  // that included them would score the local model against tags no model
  // has ever been asked for.
  for (const f of [EVAL, CLASSIFIER]) {
    assert.match(readFileSync(f, "utf8"), /neq\("group", "format_motion"\)/, f);
  }
});
