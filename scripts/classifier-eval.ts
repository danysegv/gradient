// Does a cheaper model agree with Opus about 04AM's taxonomy?
//
// This is the question that decides whether classification can be free.
// It writes NOTHING — no clip_tags, no clip_colors, no clips. It reads the
// library, asks another model to classify images Opus has already
// classified, and reports how often they pick the same tag on each axis.
//
// BACKEND-AGNOSTIC ON PURPOSE. It speaks the OpenAI-compatible
// /chat/completions API, which is the one thing every runner and every
// host agrees on, so the same script measures a model on this laptop and a
// model on somebody else's free tier without a line changing. Point
// --base-url at whatever is serving:
//
//   LM Studio (Mac GUI, model browser, one toggle to start the server)
//     --base-url http://127.0.0.1:1234/v1  --model <id shown in LM Studio>
//
//   llama.cpp (brew install llama.cpp; the engine under most of the GUIs)
//     llama-server -hf ggml-org/Qwen2.5-VL-7B-Instruct-GGUF --port 8080
//     --base-url http://127.0.0.1:8080/v1  --model local
//
//   a hosted free tier (Groq, OpenRouter, Google AI Studio's OpenAI
//   endpoint, and others — see the notes at the bottom of this file)
//     EVAL_API_KEY=sk-... --base-url https://<host>/v1 --model <model>
//
// Usage:
//   node --conditions=react-server --experimental-strip-types \
//     --env-file=.env.local scripts/classifier-eval.ts --limit 40
//
//   ... --model qwen2.5-vl-7b --edge 1024 --show-disagreements
//
// --conditions=react-server is required — lib/supabase/admin.ts imports
// "server-only". Same as scripts/read-colors.ts.
//
// HOW TO READ THE RESULT. Per-axis agreement is the number that matters,
// not the overall average: the axes are not equally hard. palette_light
// and layout are close to visible properties of the image and a small
// model should do well. movement (Poetcore, Zinepunk, Sciura) is a
// cultural judgment defined by the descriptions Daniela wrote — if a
// cheap model gets that axis, free is genuinely on the table; if it
// doesn't, the honest options are a hybrid (cheap model for the easy
// axes, Opus for movement) or accepting that the figures change.
//
// Agreement is measured against Opus, which is not ground truth — it is
// the instrument the launch board was built with. A model that disagrees
// is not necessarily wrong. It is DIFFERENT, and difference is the thing
// that breaks a time series.
//
// ⚠ THE PROMPT BELOW IS A COPY of the one in lib/claude/classify-clip.ts.
// It is duplicated on purpose: the classifier is frozen until 2026-09-26
// and extracting a shared builder would mean editing it. lib/local-eval.
// test.ts fails if the two drift apart. AFTER THE FREEZE LIFTS, extract
// the builder into lib/claude/taxonomy-prompt.ts and delete this copy.

import sharp from "sharp";
import { supabaseAdmin } from "../lib/supabase/admin.ts";

const arg = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// LM Studio's default. Anything OpenAI-compatible works — see the header.
const BASE_URL = arg("--base-url", process.env.EVAL_BASE_URL ?? "http://127.0.0.1:1234/v1")
  .replace(/\/+$/, "");
const MODEL = arg("--model", process.env.EVAL_MODEL ?? "local-model");
// Only hosted endpoints need one; local servers ignore it.
const API_KEY = process.env.EVAL_API_KEY ?? "";
const LIMIT = Number(arg("--limit", "40"));
const EDGE = Number(arg("--edge", "768"));
const SHOW = process.argv.includes("--show-disagreements");

// ---------------------------------------------------------------------
type TagRow = {
  id: string;
  group: string;
  editorial_name: string;
  universal_term: string;
  description: string;
  published_at: string | null;
};

const { data: tagData, error: tagErr } = await supabaseAdmin
  .from("tags")
  .select("id, group, editorial_name, universal_term, description, published_at")
  .neq("group", "format_motion");
if (tagErr || !tagData?.length) {
  throw new Error(`Could not load taxonomy: ${tagErr?.message ?? "no tags"}`);
}
const tags = tagData as unknown as TagRow[];
const axisOf = new Map(tags.map((t) => [t.editorial_name, t.group]));
const nameById = new Map(tags.map((t) => [t.id, t.editorial_name]));
const axisById = new Map(tags.map((t) => [t.id, t.group]));

// --- the copied prompt -----------------------------------------------
const AXIS_ORDER = [
  "movement", "typography", "palette_light", "layout",
  "treatment", "medium", "subject", "format_motion",
];
const rank = (g: string) => {
  const i = AXIS_ORDER.indexOf(g);
  return i === -1 ? AXIS_ORDER.length : i;
};
const axes = [...new Set(tags.map((t) => t.group))].sort((a, b) => rank(a) - rank(b));
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten",
];
const axisCount = NUMBER_WORDS[axes.length] ?? String(axes.length);
const taxonomyDescription = tags
  .map((t) => `- ${t.editorial_name} (${t.group}, aka "${t.universal_term}"): ${t.description}`)
  .join("\n");

// Attribution is deliberately NOT asked for here. It is a second task in
// the real classifier and it is not what this measures; asking a small
// model for two jobs at once would confound the one number we want.
const SYSTEM = `You are classifying a design reference image against 04AM's taxonomy — a faceted system across ${axisCount} axes (${axes.join(", ")}). A single image can carry a tag from every axis at once, or none from a given axis if nothing genuinely fits. For each axis, pick at most the single best-matching tag — never force a weak match. Rate your confidence in each tag from 0 to 1, calibrated to how clearly the image exhibits it.

Taxonomy:
${taxonomyDescription}

Reply with JSON only, in the form {"classifications":[{"tag":"TagName","confidence":0.0}]}. Use tag names exactly as written above.`;

// ---------------------------------------------------------------------
// The evaluation set: clips Opus has already read. Spread across the
// library rather than the most recent N — a tail of one week's clipping is
// one week's taste, and agreement on it would not generalise. md5 of the
// id is a stable shuffle, so two runs compare the same clips.
type ClipRow = {
  id: string;
  image_url: string | null;
  title: string | null;
  caption: string | null;
  clip_tags: { tag_id: string; confidence: number | null }[] | null;
};
const { data: clipData, error: clipErr } = await supabaseAdmin
  .from("clips")
  .select("id, image_url, title, caption, clip_tags ( tag_id, confidence )")
  .is("archived_at", null)
  .not("image_url", "is", null);
if (clipErr) throw clipErr;

const { createHash } = await import("node:crypto");
const shuffled = ((clipData ?? []) as unknown as ClipRow[])
  .filter((c) => (c.clip_tags?.length ?? 0) > 0)
  .sort((a, b) =>
    createHash("md5").update(a.id).digest("hex")
      .localeCompare(createHash("md5").update(b.id).digest("hex"))
  )
  .slice(0, LIMIT);

console.log(`\n04AM LOCAL CLASSIFIER EVAL`);
console.log("=".repeat(70));
console.log(`model        ${MODEL}`);
console.log(`endpoint     ${BASE_URL}${API_KEY ? "   (authenticated)" : "   (no key — local server)"}`);
console.log(`image        downscaled to ${EDGE}px longest edge`);
console.log(`clips        ${shuffled.length} of ${(clipData ?? []).length} readable`);
console.log(`taxonomy     ${tags.length} tags across ${axes.length} axes`);
console.log(`WRITES       none — this script only reads\n`);

// Opus's answer for a clip: the highest-confidence tag on each axis. That
// is what the product treats as the clip's tag on that axis, so it is the
// fair comparison. The five clips carrying two published tags on one axis
// (see 04am-prelaunch-review-2026-09-15.md) resolve to the stronger one.
function referenceByAxis(c: ClipRow): Map<string, string> {
  const best = new Map<string, { name: string; conf: number }>();
  for (const ct of c.clip_tags ?? []) {
    const axis = axisById.get(ct.tag_id);
    const name = nameById.get(ct.tag_id);
    if (!axis || !name) continue;
    const conf = ct.confidence ?? 0;
    const held = best.get(axis);
    if (!held || conf > held.conf) best.set(axis, { name, conf });
  }
  return new Map([...best].map(([axis, v]) => [axis, v.name]));
}

async function askModel(b64: string, context: string): Promise<Map<string, string>> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 1024,
      // Honoured by most servers, ignored by the rest — the parser below
      // salvages prose either way, so this is an optimisation, not a
      // dependency.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: context },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${b64}` },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = body.choices?.[0]?.message?.content ?? "";
  let parsed: { classifications?: { tag?: string; confidence?: number }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Small models wrap JSON in prose even when asked not to, and some
    // fence it. One salvage attempt, then the clip counts as unparseable
    // rather than as a disagreement — those are different failures and
    // conflating them would flatter or damn the model for the wrong
    // reason.
    const m = raw.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in response");
    parsed = JSON.parse(m[0]);
  }
  const best = new Map<string, { name: string; conf: number }>();
  for (const c of parsed.classifications ?? []) {
    if (typeof c?.tag !== "string") continue;
    const axis = axisOf.get(c.tag);
    if (!axis) {
      // A tag name that isn't in the taxonomy. The real classifier makes
      // this impossible with a zod enum; a plain JSON endpoint cannot, so
      // it is counted rather than quietly dropped — a model that invents
      // names is telling you something about how usable it is.
      hallucinatedNames++;
      continue;
    }
    const conf = typeof c.confidence === "number" ? c.confidence : 0;
    const held = best.get(axis);
    if (!held || conf > held.conf) best.set(axis, { name: c.tag, conf });
  }
  return new Map([...best].map(([axis, v]) => [axis, v.name]));
}

const agree = new Map<string, number>();
const total = new Map<string, number>();
const localSaidNothing = new Map<string, number>();
const confusions = new Map<string, number>();
const timings: number[] = [];
let unparseable = 0;
let unfetchable = 0;
let hallucinatedNames = 0;

for (const [i, clip] of shuffled.entries()) {
  const ref = referenceByAxis(clip);
  process.stdout.write(`[${String(i + 1).padStart(3)}/${shuffled.length}] ${clip.id.slice(0, 8)} `);
  let b64: string;
  try {
    const r = await fetch(clip.image_url!, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(String(r.status));
    b64 = (
      await sharp(Buffer.from(await r.arrayBuffer()))
        .resize(EDGE, EDGE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer()
    ).toString("base64");
  } catch {
    unfetchable++;
    console.log("image unreadable — skipped");
    continue;
  }

  const context = [
    clip.title ? `Title: ${clip.title}` : null,
    clip.caption ? `Caption: ${clip.caption}` : null,
  ].filter(Boolean).join("\n") || "(no context)";

  const started = Date.now();
  let local: Map<string, string>;
  try {
    local = await askModel(b64, context);
  } catch (e) {
    unparseable++;
    console.log(`unparseable — ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  const seconds = (Date.now() - started) / 1000;
  timings.push(seconds);

  let hits = 0;
  for (const [axis, refTag] of ref) {
    total.set(axis, (total.get(axis) ?? 0) + 1);
    const got = local.get(axis);
    if (got === undefined) {
      localSaidNothing.set(axis, (localSaidNothing.get(axis) ?? 0) + 1);
    } else if (got === refTag) {
      agree.set(axis, (agree.get(axis) ?? 0) + 1);
      hits++;
    } else {
      const key = `${axis}: ${refTag} → ${got}`;
      confusions.set(key, (confusions.get(key) ?? 0) + 1);
      if (SHOW) console.log(`\n      ${key}`);
    }
  }
  console.log(`${hits}/${ref.size} axes  ${seconds.toFixed(1)}s`);
}

// ---------------------------------------------------------------------
console.log("\n" + "=".repeat(70));
console.log("AGREEMENT WITH OPUS, BY AXIS");
console.log("=".repeat(70));
console.log("axis".padEnd(16) + "agree".padStart(8) + "of".padStart(6) + "  " + "rate".padStart(7) + "   silent");
console.log("-".repeat(70));
let allAgree = 0;
let allTotal = 0;
for (const axis of axes) {
  const t = total.get(axis) ?? 0;
  if (t === 0) continue;
  const a = agree.get(axis) ?? 0;
  allAgree += a;
  allTotal += t;
  const silent = localSaidNothing.get(axis) ?? 0;
  console.log(
    axis.padEnd(16) +
    String(a).padStart(8) + String(t).padStart(6) + "  " +
    ((a / t) * 100).toFixed(1).padStart(6) + "%" +
    String(silent).padStart(9)
  );
}
console.log("-".repeat(70));
console.log(
  "ALL".padEnd(16) + String(allAgree).padStart(8) + String(allTotal).padStart(6) +
  "  " + (allTotal ? ((allAgree / allTotal) * 100).toFixed(1) : "0.0").padStart(6) + "%"
);

if (timings.length) {
  const sorted = [...timings].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(
    `\nSPEED        median ${median.toFixed(1)}s/clip  →  ` +
    `~${Math.round(3600 / median)} clips/hour on this machine`
  );
}
if (hallucinatedNames) {
  console.log(
    `INVENTED     ${hallucinatedNames} tag name(s) not in the taxonomy` +
    `\n             The real classifier makes this impossible (zod enum over the` +
    `\n             tag names). A plain JSON endpoint can't, so this is the cost` +
    `\n             of leaving Anthropic's structured output behind.`
  );
}
if (unfetchable || unparseable) {
  console.log(
    `SKIPPED      ${unfetchable} image unreadable, ${unparseable} response unparseable` +
    (unparseable ? "  ← a high count here means the MODEL is unusable, not that it disagrees" : "")
  );
}

const worst = [...confusions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
if (worst.length) {
  console.log("\nMOST COMMON DISAGREEMENTS (Opus → local)");
  console.log("-".repeat(70));
  for (const [k, n] of worst) console.log(`  ${String(n).padStart(3)}×  ${k}`);
}

console.log(`
${"=".repeat(70)}
HOW TO READ THIS
${"=".repeat(70)}
Per-axis rate is the number, not ALL. A local model that matches on
palette_light and layout but not movement still saves most of the bill: run
it on the axes it knows and send only the rest to the API.

"silent" is the model declining to tag an axis Opus tagged. Some of that is
honest — the prompt says never force a weak match — but a large silent
count on every axis usually means the model is not following the format
rather than being careful.

Nothing here is ground truth. Opus is the instrument the launch board was
built with, so disagreement means the figures would MOVE if you switched,
not that either model is wrong.
`);

// ---------------------------------------------------------------------
// NOTES ON BACKENDS, 2026-09-17
//
// Local, on this Mac. Free forever, no quota, no terms to read, and the
// images never leave the machine. Costs RAM — this Air is memory-tight
// (macOS has killed `npm run dev` on it twice), so close things first and
// drop to a 3B model if a 7B thrashes. LM Studio is the gentlest way in;
// llama.cpp is the same engine without the GUI.
//
// A hosted free tier. Free up to a quota, no local compute, and the models
// on offer are better than anything an Air can run. At 04AM's volume —
// about 45 clips a week — a daily-request quota is very likely enough, so
// this is worth pricing before assuming local is the only free route.
// Three things to check before depending on one: whether the quota is per
// day or per minute, whether they train on the requests (04AM's images are
// other people's work), and how much notice a free tier gets before it
// changes. A pipeline that stops when someone else's promotion ends is not
// free, it is borrowed.
//
// Either way the switch is --base-url and --model. That is the point of
// measuring through an interface everyone implements rather than through
// one vendor's SDK.
