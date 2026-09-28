// robots.txt, read for the market series. Pure: parsing and matching only.
//
// lib/clips/image-bytes.ts has a smaller reader that only knows `*`. The
// market needs more, because the market's rule is stricter than the
// clipper's: a curator saving one image they are looking at is a person;
// the market runner is a machine reading a publication on a schedule, and
// under EU law (DSM Directive art. 4) a machine-readable reservation of
// text-and-data-mining rights has to be honoured. robots.txt naming AI
// agents is the most common such reservation, so the runner asks two
// questions of every robots.txt:
//
//   1. May OUR agent, and the agents Anthropic fetches with, read this path?
//   2. Has the site reserved itself from AI reading at all — any known AI
//      agent disallowed from the whole site? If so the source pauses, even
//      when the agent named is not ours. Conservative on purpose: a site
//      that says no to one AI reader is not saying yes to another.
//
// Matching follows RFC 9309: the group whose user-agent token matches is
// used (most specific wins), falling back to `*`; within it the longest
// matching rule wins, Allow beating Disallow on a tie; `*` and `$` are
// wildcards.

export const MARKET_USER_AGENT_TOKEN = "04AM-Market";
export const MARKET_USER_AGENT =
  "04AM-Market/1.0 (+https://gradient-flax.vercel.app/radar; reads feeds, stores links and tags only)";

/** Who actually fetches: us, and Anthropic's fetchers for the image. */
export const READING_AGENTS = [
  MARKET_USER_AGENT_TOKEN,
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
] as const;

/** Any of these barred from the whole site counts as an AI reservation. */
export const AI_AGENTS = [
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Bytespider",
  "meta-externalagent",
  "cohere-ai",
  "img2dataset",
] as const;

type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[]; crawlDelay: number | null };

export type Robots = { groups: Group[] };

export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      // An empty Disallow allows everything; it is simply no rule.
      if (value === "") continue;
      current.rules.push({ allow: key === "allow", path: value });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups };
}

/** The group that governs `agent`: an exact token match, else `*`, else none. */
function groupFor(robots: Robots, agent: string): Group[] {
  const a = agent.toLowerCase();
  const named = robots.groups.filter((g) => g.agents.some((x) => x !== "*" && a.startsWith(x)));
  if (named.length > 0) return named;
  return robots.groups.filter((g) => g.agents.includes("*"));
}

function ruleMatches(pattern: string, path: string): number {
  // Returns the pattern's length when it matches, -1 otherwise.
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    "^" +
      body
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      (anchored ? "$" : "")
  );
  return re.test(path) ? pattern.length : -1;
}

export function allows(robots: Robots, agent: string, path: string): boolean {
  const rules = groupFor(robots, agent).flatMap((g) => g.rules);
  let best: { len: number; allow: boolean } | null = null;
  for (const r of rules) {
    const len = ruleMatches(r.path, path);
    if (len < 0) continue;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

export function crawlDelay(robots: Robots, agent: string): number | null {
  const ds = groupFor(robots, agent)
    .map((g) => g.crawlDelay)
    .filter((d): d is number => d !== null);
  return ds.length ? Math.max(...ds) : null;
}

/** The AI agents this site bars from its front page, i.e. site-wide. */
export function aiReservations(robots: Robots): string[] {
  return AI_AGENTS.filter((agent) =>
    robots.groups.some(
      (g) => g.agents.includes(agent.toLowerCase()) && !allows(robots, agent, "/")
    )
  );
}

/** Every reading agent may fetch `path`. */
export function readableBy(robots: Robots, path: string): { ok: boolean; blocked: string[] } {
  const blocked = READING_AGENTS.filter((a) => !allows(robots, a, path));
  return { ok: blocked.length === 0, blocked };
}
