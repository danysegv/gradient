// Where to send someone after signing in. Only a path on this site: an
// open redirect ("?next=https://evil.example") would let a phishing link
// borrow 04AM's sign-in page.
export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}
