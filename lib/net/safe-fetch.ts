// Every fetch the server makes to an address someone else chose — a page or
// image a curator clipped, an item from a market feed, that host's
// robots.txt — goes through here (security review 2026-10-13, #6).
//
// The risk it closes: the server would otherwise fetch whatever it is
// handed, including addresses that only make sense from inside a network
// (localhost, 10.x, 192.168.x, the cloud metadata service at
// 169.254.169.254). That is server-side request forgery. Each hop is
// checked, redirects included: a public page that answers "302 → 127.0.0.1"
// is refused at the redirect, not followed.
//
// What it can't close on its own: a hostname that resolves to a public
// address when checked and a private one a moment later (DNS rebinding).
// Vercel's functions have no private network worth reaching, so the check
// is the practical line, not a perfect one.
//
// Pure helpers are exported for tests; the resolver can be swapped in tests
// so they never touch real DNS.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class BlockedAddressError extends Error {
  readonly url: string;
  constructor(url: string, reason: string) {
    super(`blocked ${url}: ${reason}`);
    this.name = "BlockedAddressError";
    this.url = url;
  }
}

type Resolver = (hostname: string) => Promise<string[]>;

const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

let resolver: Resolver = systemResolver;

/** Tests only: answer DNS without the network. Pass null to restore. */
export function setResolverForTests(r: Resolver | null): void {
  resolver = r ?? systemResolver;
}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
];

function v4Public(ip: string): boolean {
  const n = v4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

/** Whether an IP address is on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Public(ip);
  if (kind !== 6) return false;
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4 written inside IPv6 (::ffff:10.0.0.1, 64:ff9b::a00:1 is rarer): judge the v4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return v4Public(mapped[1]);
  if (v6 === "::" || v6 === "::1") return false;
  if (/^f[cd]/.test(v6)) return false; // fc00::/7 unique local
  if (/^fe[89ab]/.test(v6)) return false; // fe80::/10 link-local
  if (/^ff/.test(v6)) return false; // multicast
  if (v6.startsWith("64:ff9b:")) return false; // NAT64, can point anywhere
  if (v6.startsWith("2001:db8:")) return false; // documentation
  return true;
}

/** Hostnames that only ever mean "inside": refused before any lookup. */
export function isInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return true;
  const literal = h.replace(/^\[|\]$/g, "");
  if (isIP(literal)) return !isPublicAddress(literal);
  return !h.includes("."); // a bare name ("metadata", "intranet") only resolves inside a network
}

/** Throws BlockedAddressError unless the URL is http(s) on a public address. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedAddressError(raw, "not a URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BlockedAddressError(raw, `protocol ${url.protocol}`);
  }
  if (url.username || url.password) throw new BlockedAddressError(raw, "credentials in URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isInternalHostname(host)) throw new BlockedAddressError(raw, "internal host");
  if (isIP(host)) return url; // a public literal, already judged above
  const addresses = await resolver(host);
  if (addresses.length === 0) throw new BlockedAddressError(raw, "no address");
  const inside = addresses.find((a) => !isPublicAddress(a));
  if (inside) throw new BlockedAddressError(raw, `resolves to ${inside}`);
  return url;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * fetch(), refusing anything that isn't a public address — at every
 * redirect, which it follows itself (at most `maxRedirects`).
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  { maxRedirects = 5 }: { maxRedirects?: number } = {}
): Promise<Response> {
  let current = url;
  let options: RequestInit = { ...init, redirect: "manual" };
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, options);
    if (!REDIRECTS.has(res.status)) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    if (hop >= maxRedirects) {
      await res.body?.cancel().catch(() => {});
      throw new BlockedAddressError(current, "too many redirects");
    }
    await res.body?.cancel().catch(() => {});
    current = new URL(location, current).toString();
    // A 303 (and, by browser convention, 301/302 after POST) becomes a GET.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && options.method && options.method !== "GET")) {
      options = { ...options, method: "GET", body: undefined };
    }
  }
}

/** The whole body, or null if it runs past `maxBytes` (reading stops there). */
export async function readBytesLimited(res: Response, maxBytes: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** The body as text, but never more than `maxBytes` of it. */
export async function readTextLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    if (value.byteLength >= room) {
      chunks.push(value.subarray(0, room));
      total += room;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
