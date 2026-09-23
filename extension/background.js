// 04AM Clipper — background.
//
// One classic script for every browser: Chrome and Edge run it as a
// service worker, Firefox and Safari as an event page (manifest lists
// both). It is the only part of the extension that holds the account
// session or talks to 04AM; the popup, the panel and the page script all
// ask it by message.
//
// Rights posture, carried from the site (CLAUDE.md legal note): the
// extension sends ADDRESSES, never image bytes. No screenshots, no
// uploads, no cropping — a clip is the page's URL and the image's own
// URL, hotlinked and shown whole.

const ext = globalThis.browser ?? globalThis.chrome;

const DEFAULT_ORIGIN = "https://gradient-flax.vercel.app";
const ALLOWED_ORIGINS = [DEFAULT_ORIGIN, "http://localhost:3000"];

// ---------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------

async function origin() {
  const { origin: o } = await ext.storage.local.get("origin");
  return ALLOWED_ORIGINS.includes(o) ? o : DEFAULT_ORIGIN;
}

async function readSession() {
  const { session } = await ext.storage.local.get("session");
  return session && session.access_token ? session : null;
}

async function writeSession(session) {
  if (session) await ext.storage.local.set({ session });
  else await ext.storage.local.remove("session");
  await syncAction(session);
}

// One refresh at a time: Supabase rotates refresh tokens, so two parallel
// refreshes with the same token would sign the second one out.
let refreshing = null;

async function refresh(session) {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${await origin()}/api/extension/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.access_token) {
          await writeSession(body);
          return body;
        }
        // A definite "no" signs out; a network wobble keeps the session.
        if (res.status === 401 || res.status === 403) await writeSession(null);
        return null;
      } catch {
        return null;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

async function freshSession() {
  const s = await readSession();
  if (!s) return null;
  const soon = Math.floor(Date.now() / 1000) + 60;
  return s.expires_at && s.expires_at > soon ? s : refresh(s);
}

/** Calls 04AM as the signed-in curator; refreshes once on a stale token. */
async function api(path, init = {}) {
  let s = await freshSession();
  if (!s) return { status: 401, body: { error: "Signed out." } };
  const call = async (token) => {
    const res = await fetch(`${await origin()}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${token}`,
      },
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try {
    let out = await call(s.access_token);
    if (out.status === 401) {
      s = await refresh(s);
      if (!s) {
        await writeSession(null);
        return { status: 401, body: { error: "Signed out. Sign in again." } };
      }
      out = await call(s.access_token);
      if (out.status === 401) await writeSession(null);
    }
    return out;
  } catch {
    return { status: 0, body: { error: "Can't reach 04AM. Check your connection." } };
  }
}

// ---------------------------------------------------------------------
// Toolbar: signed out → the sign-in popup; signed in → straight to the
// picker, one click.
// ---------------------------------------------------------------------

async function syncAction(session) {
  const s = session === undefined ? await readSession() : session;
  try {
    await ext.action.setPopup({ popup: s ? "" : "popup.html" });
    await ext.action.setTitle({ title: s ? `Clip to 04AM — @${s.curator?.name ?? ""}` : "Sign in to clip to 04AM" });
  } catch {
    // Older Safari builds: the popup stays; it offers the picker too.
  }
}

ext.action.onClicked.addListener((tab) => openPicker(tab));

// ---------------------------------------------------------------------
// The toolbar icon is the wordmark alone, no ground: Ink type when the
// browser is light, Bone type when it's dark. It is drawn from the vector
// wordmark (icons/wordmark.svg, the same path as components/wordmark.tsx)
// at each exact pixel size the browser asks for, so it stays crisp at 1x,
// 1.5x and 2x instead of being a scaled-down picture. The PNGs are only a
// fallback for a browser that can't draw off-screen.
//
// A manifest can't switch icons by theme, so the background sets it —
// directly where it can read the colour scheme (Firefox's and Safari's
// event pages have matchMedia), and through a tiny offscreen page on
// Chrome and Edge, whose service worker can't.
// ---------------------------------------------------------------------

const INK = "#0B0A0E";
const BONE = "#E7E3D8";
const TOOLBAR_ICON = {
  light: { 16: "icons/toolbar-ink-16.png", 32: "icons/toolbar-ink-32.png", 48: "icons/toolbar-ink-48.png" },
  dark: { 16: "icons/toolbar-bone-16.png", 32: "icons/toolbar-bone-32.png", 48: "icons/toolbar-bone-48.png" },
};
// Toolbar sizes at every common screen density (16px and 19px slots).
const ICON_SIZES = [16, 19, 24, 32, 38, 48];
// Where the letters sit inside the wordmark's 2691 × 846 viewBox.
const MARK = { x: 40, y: 40, w: 2611, h: 766 };

let wordmarkPath = null;
async function wordmarkD() {
  if (wordmarkPath) return wordmarkPath;
  const svg = await (await fetch(ext.runtime.getURL("icons/wordmark.svg"))).text();
  wordmarkPath = /\sd="([^"]+)"/.exec(svg)?.[1] ?? null;
  return wordmarkPath;
}

/** A canvas of exactly this many pixels, whatever the background is. */
function canvasFor(size) {
  // Chrome and Edge run a service worker: no DOM, so OffscreenCanvas.
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(size, size);
  // Firefox and Safari run a background PAGE, which has a real canvas even
  // where OffscreenCanvas is missing (Safari before 16.4).
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }
  return null;
}

/** The wordmark as ImageData at each size, or null where that can't be drawn. */
async function drawToolbarIcon(colour) {
  if (typeof Path2D !== "function") return null;
  const d = await wordmarkD();
  if (!d) return null;
  const path = new Path2D(d);
  const out = {};
  for (const size of ICON_SIZES) {
    const g = canvasFor(size)?.getContext("2d");
    if (!g) return null;
    const s = size / MARK.w;
    // Full width; the top edge snapped to a whole pixel so the letters'
    // flat tops and baselines land on the grid instead of smearing across two rows.
    const top = Math.round((size - MARK.h * s) / 2);
    g.setTransform(s, 0, 0, s, -MARK.x * s, top - MARK.y * s);
    g.fillStyle = colour;
    g.fill(path, "evenodd"); // evenodd punches the counters, as in the SVG
    out[size] = g.getImageData(0, 0, size, size);
  }
  return out;
}

async function setScheme(dark) {
  try {
    const imageData = await drawToolbarIcon(dark ? BONE : INK);
    if (imageData) {
      await ext.action.setIcon({ imageData });
      return;
    }
  } catch {
    /* fall through to the PNGs */
  }
  try {
    await ext.action.setIcon({ path: dark ? TOOLBAR_ICON.dark : TOOLBAR_ICON.light });
  } catch {
    /* the manifest's default (Ink) stays */
  }
}

async function watchScheme() {
  if (typeof globalThis.matchMedia === "function") {
    const mq = globalThis.matchMedia("(prefers-color-scheme: dark)");
    setScheme(mq.matches);
    mq.addEventListener?.("change", (e) => setScheme(e.matches));
    return;
  }
  if (ext.offscreen?.createDocument) {
    try {
      if (!(await ext.offscreen.hasDocument?.())) {
        await ext.offscreen.createDocument({
          url: "scheme.html",
          reasons: ["MATCH_MEDIA"],
          justification: "Match the toolbar icon to the browser's light or dark mode.",
        });
      }
    } catch {
      /* already open, or not allowed: the default icon stays */
    }
  }
}

// ---------------------------------------------------------------------
// The page script: injected only when asked (activeTab), never on load.
// ---------------------------------------------------------------------

async function ensurePageScript(tabId) {
  await ext.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function send(tab, message) {
  if (!tab || tab.id == null) return;
  try {
    await ensurePageScript(tab.id);
    await ext.tabs.sendMessage(tab.id, message);
  } catch {
    // Browser pages, store pages and PDFs don't take scripts.
    flash(tab.id, "×");
  }
}

function flash(tabId, text) {
  try {
    ext.action.setBadgeBackgroundColor?.({ color: "#0B0A0E", tabId });
    ext.action.setBadgeText({ text, tabId });
    setTimeout(() => ext.action.setBadgeText({ text: "", tabId }), 2400);
  } catch {
    /* badge is a nicety */
  }
}

async function openPicker(tab) {
  if (!(await readSession())) {
    // Keyboard shortcut or menu while signed out: open the sign-in page.
    ext.runtime.openOptionsPage();
    return;
  }
  await send(tab, { type: "04am:pick" });
}

// ---------------------------------------------------------------------
// Right-click
// ---------------------------------------------------------------------

// Serialised: the background can wake and install at the same moment,
// and two interleaved rebuilds would collide on the ids.
let menus = Promise.resolve();
function buildMenus() {
  menus = menus
    .then(() => ext.contextMenus.removeAll())
    .then(() => {
      ext.contextMenus.create({ id: "04am-clip-image", title: "Clip image to 04AM", contexts: ["image"] });
      ext.contextMenus.create({
        id: "04am-pick",
        title: "Choose an image to clip…",
        // Instagram and friends lay a transparent layer over every image, so
        // a right-click there never lands on the <img>. The picker finds it.
        contexts: ["page", "link", "frame", "selection", "video"],
      });
    })
    .catch(() => {});
  return menus;
}

ext.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!(await readSession())) {
    ext.runtime.openOptionsPage();
    return;
  }
  if (info.menuItemId === "04am-clip-image") {
    await send(tab, { type: "04am:clip-src", src: info.srcUrl, frameUrl: info.frameUrl ?? null });
  } else if (info.menuItemId === "04am-pick") {
    await send(tab, { type: "04am:pick" });
  }
});

ext.commands?.onCommand.addListener(async (command, tab) => {
  if (command !== "pick") return;
  const t = tab ?? (await ext.tabs.query({ active: true, currentWindow: true }))[0];
  openPicker(t);
});

// ---------------------------------------------------------------------
// Handing a chosen image from the page to the panel. The panel is an
// extension page in an iframe, so the page itself can't read it; the
// candidate travels through here.
// ---------------------------------------------------------------------

const stash = new Map();

async function putCandidate(candidate) {
  const id = crypto.randomUUID();
  stash.set(id, candidate);
  try {
    await ext.storage.session?.set({ [`c:${id}`]: candidate });
  } catch {
    /* memory copy is enough while the worker is awake */
  }
  return id;
}

async function takeCandidate(id) {
  let c = stash.get(id);
  if (!c) {
    try {
      c = (await ext.storage.session?.get(`c:${id}`))?.[`c:${id}`];
    } catch {
      /* none */
    }
  }
  return c ?? null;
}

// ---------------------------------------------------------------------
// Messages from the popup, options page, panel and page script
// ---------------------------------------------------------------------

const handlers = {
  async "session:get"() {
    const s = await readSession();
    return { signedIn: !!s, name: s?.curator?.name ?? null, origin: await origin() };
  },

  async "session:signin"({ email, password }) {
    try {
      const res = await fetch(`${await origin()}/api/extension/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.access_token) {
        await writeSession(body);
        return { ok: true, name: body.curator.name };
      }
      return { ok: false, error: body.error ?? "Something went wrong. Try again.", code: body.code ?? null };
    } catch {
      return { ok: false, error: "Can't reach 04AM. Check your connection." };
    }
  },

  async "session:signout"() {
    const s = await readSession();
    await writeSession(null);
    if (s) {
      fetch(`${await origin()}/api/extension/session`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${s.access_token}` },
      }).catch(() => {});
    }
    return { ok: true };
  },

  async "origin:set"({ value }) {
    if (!ALLOWED_ORIGINS.includes(value)) return { ok: false };
    const current = await origin();
    if (value !== current) {
      // A session belongs to one site's account system.
      await writeSession(null);
      await ext.storage.local.set({ origin: value });
    }
    return { ok: true };
  },

  async "picker:open"(_msg, sender) {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    await openPicker(sender.tab ?? tab);
    return { ok: true };
  },

  async "scheme:set"({ dark }) {
    await setScheme(!!dark);
    return { ok: true };
  },

  async "candidate:put"({ candidate }) {
    return { id: await putCandidate(candidate) };
  },

  async "candidate:take"({ id }) {
    return { candidate: await takeCandidate(id) };
  },

  async "clip:lookup"({ url, image_url }) {
    return api("/api/extension/lookup", { method: "POST", body: JSON.stringify({ url, image_url }) });
  },

  async "clip:save"({ clip }) {
    return api("/api/extension/clip", { method: "POST", body: JSON.stringify(clip) });
  },

  // The panel asks the page script (its parent) to close or re-open the
  // picker. Routed here because only the background knows the tab.
  async "panel:close"(_msg, sender) {
    if (sender.tab?.id != null) ext.tabs.sendMessage(sender.tab.id, { type: "04am:close" }).catch?.(() => {});
    return { ok: true };
  },

  async "panel:again"(_msg, sender) {
    if (sender.tab?.id != null) ext.tabs.sendMessage(sender.tab.id, { type: "04am:pick" }).catch?.(() => {});
    return { ok: true };
  },
};

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg && typeof msg.type === "string" ? handlers[msg.type] : null;
  if (!handler) return false;
  // Only this extension's own pages and its injected page script talk to
  // it; a web page cannot reach runtime.onMessage.
  if (sender.id && sender.id !== ext.runtime.id) return false;
  Promise.resolve(handler(msg, sender))
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true;
});

// ---------------------------------------------------------------------
// Start-up: menus and the toolbar state are rebuilt every time the
// background wakes, which is the one behaviour all four browsers share.
// ---------------------------------------------------------------------

buildMenus();
syncAction();
watchScheme();
ext.runtime.onInstalled.addListener((details) => {
  buildMenus();
  syncAction();
  if (details.reason === "install") ext.runtime.openOptionsPage();
});
