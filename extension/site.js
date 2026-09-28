// 04AM Clipper — on 04AM's own pages only (manifest content_scripts).
//
// One sign-in across the site and the extension (2026-09-27). This asks
// the site, with the site's own cookies, who is signed in, tells the
// background, and does what it decides:
//
//   handoff — the extension picks up the site's sign-in;
//   adopt   — the site picks up the extension's, then the page reloads;
//   nothing — they already agree (or the site signed out, and the
//             background has signed the extension out to match).
//
// Nothing here reads the page, and tokens never enter the page's own
// scripts: a content script runs in its own isolated world.

(() => {
  const ext = globalThis.browser ?? globalThis.chrome;
  // Firefox: content.fetch makes the request as the page (same origin,
  // with its cookies). Chrome and Safari's fetch already does.
  const pageFetch =
    globalThis.content && typeof globalThis.content.fetch === "function"
      ? globalThis.content.fetch.bind(globalThis.content)
      : globalThis.fetch.bind(globalThis);
  const BRIDGE = { "x-04am-clipper": "1" };
  const ADOPTED = "04am-clipper-adopted";

  let busy = false;

  async function ask(msg) {
    try {
      return await ext.runtime.sendMessage(msg);
    } catch {
      return null; // the extension was reloaded or removed
    }
  }

  async function sync() {
    if (busy) return;
    busy = true;
    try {
      const res = await pageFetch("/api/extension/link", {
        credentials: "same-origin",
        cache: "no-store",
        headers: BRIDGE,
      });
      if (!res.ok) return;
      const state = await res.json();
      const plan = await ask({ type: "site:state", ...state });

      if (plan?.do === "handoff") {
        const r = await pageFetch("/api/extension/handoff", {
          method: "POST",
          credentials: "same-origin",
          headers: BRIDGE,
        });
        if (!r.ok) return;
        const session = await r.json();
        await ask({ type: "site:handoff", session, remember: session.remember });
      } else if (plan?.do === "adopt" && plan.token) {
        // Once per minute at most, so a site that won't take the cookies
        // can never reload in a loop.
        const last = Number(sessionStorage.getItem(ADOPTED) || 0);
        if (Date.now() - last < 60_000) return;
        sessionStorage.setItem(ADOPTED, String(Date.now()));
        const r = await pageFetch("/api/extension/adopt", {
          method: "POST",
          credentials: "same-origin",
          headers: { ...BRIDGE, "content-type": "application/json", authorization: `Bearer ${plan.token}` },
          body: JSON.stringify({ remember: plan.remember !== false }),
        });
        if (!r.ok) return;
        await ask({ type: "site:adopted" });
        location.reload();
      }
    } catch {
      // offline, or the site is down: try again next time the tab shows
    } finally {
      busy = false;
    }
  }

  sync();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
})();
