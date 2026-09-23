// 04AM Clipper — page script.
//
// Injected into a tab only when the curator asks (toolbar, right-click or
// shortcut), never on page load. It does two things: shows the picker —
// every image on the page large enough to be a reference, whole, never
// cropped — and opens the panel beside the page once one is chosen.
//
// It reads ADDRESSES and a few words the page already publishes (title,
// author, caption). It never draws, screenshots or uploads an image: a
// clip is a link to the original, which stays on its maker's server.

(() => {
  if (window.__04amClipper) return;
  window.__04amClipper = true;

  const ext = globalThis.browser ?? globalThis.chrome;
  const MIN_SIDE = 160;
  const HOST_ID = "clipper-04am-root";

  // -------------------------------------------------------------------
  // Addresses
  // -------------------------------------------------------------------

  const isPublic = (u) => /^https?:\/\//i.test(u || "");

  function absolute(u) {
    if (!u) return null; // new URL(null, base) would quietly become ".../null"
    try {
      return new URL(u, document.baseURI).href;
    } catch {
      return null;
    }
  }

  /** The page address a clip links back to: no tracking junk, no hash. */
  function pageAddress() {
    try {
      const u = new URL(location.href);
      u.hash = "";
      for (const k of [...u.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$|igsh$|igshid$|mc_cid$|mc_eid$|ref_src$|si$)/i.test(k)) u.searchParams.delete(k);
      }
      return u.href;
    } catch {
      return location.href;
    }
  }

  /** Parses a srcset into [{url, w}], w in CSS px (x descriptors scaled). */
  function parseSrcset(srcset, baseWidth) {
    if (!srcset) return [];
    return srcset
      .split(/,\s+(?=[^,\s])/)
      .map((part) => {
        const [url, desc = ""] = part.trim().split(/\s+/);
        const n = parseFloat(desc);
        const w = /w$/i.test(desc) ? n : /x$/i.test(desc) ? n * (baseWidth || 1) : 0;
        return { url: absolute(url), w: Number.isFinite(w) ? w : 0 };
      })
      .filter((c) => c.url);
  }

  const LAZY_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-full", "data-large-file", "data-orig-file"];

  /** The largest version of an <img> the page itself offers. */
  function bestImgSource(img) {
    const base = img.naturalWidth || img.width || 1;
    const options = [
      ...parseSrcset(img.getAttribute("srcset") || img.getAttribute("data-srcset"), base),
    ];
    const picture = img.parentElement?.tagName === "PICTURE" ? img.parentElement : null;
    if (picture) {
      for (const s of picture.querySelectorAll("source")) {
        options.push(...parseSrcset(s.getAttribute("srcset") || s.getAttribute("data-srcset"), base));
      }
    }
    options.sort((a, b) => b.w - a.w);
    const best = options.find((o) => isPublic(o.url));
    if (best) return best.url;
    const current = img.currentSrc || img.src;
    if (isPublic(current)) return current;
    for (const a of LAZY_ATTRS) {
      const v = absolute(img.getAttribute(a));
      if (isPublic(v)) return v;
    }
    return current || null;
  }

  // -------------------------------------------------------------------
  // What the page says about itself — offered as suggestions, never
  // filled in silently. A typed credit is a person's judgement; one read
  // off a meta tag is not, and the library keeps that distinction.
  // -------------------------------------------------------------------

  function meta(sel) {
    const el = document.querySelector(sel);
    const v = el?.getAttribute("content")?.trim();
    return v || null;
  }

  function jsonLdPeople() {
    const names = new Set();
    const visit = (node, depth) => {
      if (!node || depth > 6) return;
      if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
      if (typeof node !== "object") return;
      for (const key of ["creator", "author", "copyrightHolder"]) {
        const v = node[key];
        const list = Array.isArray(v) ? v : v ? [v] : [];
        for (const p of list) {
          const name = typeof p === "string" ? p : p?.name;
          if (typeof name === "string" && name.trim() && !isPublic(name)) names.add(name.trim());
        }
      }
      for (const v of Object.values(node)) if (v && typeof v === "object") visit(v, depth + 1);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        visit(JSON.parse(s.textContent || "null"), 0);
      } catch {
        /* malformed JSON-LD is common */
      }
    }
    return [...names].slice(0, 4);
  }

  function pageFacts() {
    const author = meta('meta[name="author"]');
    const articleAuthor = meta('meta[property="article:author"]');
    const twitter = meta('meta[name="twitter:creator"]');
    const people = [
      ...jsonLdPeople(),
      ...(author && !isPublic(author) ? [author] : []),
      ...(articleAuthor && !isPublic(articleAuthor) ? [articleAuthor] : []),
      ...(twitter ? [twitter] : []),
    ];
    return {
      title: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title?.trim() || null,
      siteName: meta('meta[property="og:site_name"]'),
      people: [...new Set(people)].slice(0, 4),
    };
  }

  function captionFor(el) {
    const fig = el?.closest?.("figure");
    const text = fig?.querySelector("figcaption")?.innerText?.trim();
    return text ? text.slice(0, 400) : null;
  }

  // -------------------------------------------------------------------
  // Finding every candidate on the page
  // -------------------------------------------------------------------

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    return { area: r.width * r.height, visible, w: r.width, h: r.height };
  }

  function findCandidates() {
    const seen = new Map();
    const add = (c) => {
      if (!c.src) return;
      const prev = seen.get(c.src);
      if (!prev || c.area > prev.area) seen.set(c.src, c);
    };

    for (const img of document.images) {
      if (img.closest(`#${HOST_ID}`)) continue;
      const src = bestImgSource(img);
      const w = img.naturalWidth, h = img.naturalHeight;
      const r = rectOf(img);
      const big = (w >= MIN_SIDE && h >= MIN_SIDE) || (r.w >= MIN_SIDE && r.h >= MIN_SIDE && !w);
      if (!big) continue;
      add({ src, width: w || null, height: h || null, alt: img.alt?.trim() || null, caption: captionFor(img), el: img, ...r });
    }

    for (const v of document.querySelectorAll("video[poster]")) {
      const r = rectOf(v);
      if (r.w >= MIN_SIDE && r.h >= MIN_SIDE) {
        add({ src: absolute(v.getAttribute("poster")), width: null, height: null, alt: null, caption: captionFor(v), el: v, ...r, poster: true });
      }
    }

    // CSS background images, the other way sites show work. Bounded so a
    // huge page can't stall the picker.
    let scanned = 0;
    for (const el of document.body?.querySelectorAll("*") ?? []) {
      if (++scanned > 5000) break;
      if (el.id === HOST_ID) continue;
      const r = el.getBoundingClientRect();
      if (r.width < MIN_SIDE || r.height < MIN_SIDE) continue;
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg !== "none" ? /url\(["']?([^"')]+)["']?\)/.exec(bg) : null;
      if (!m || /^data:image\/svg/i.test(m[1])) continue;
      const rr = rectOf(el);
      add({ src: absolute(m[1]), width: null, height: null, alt: el.getAttribute("aria-label"), caption: captionFor(el), el, ...rr });
    }

    // The page's own share image, when nothing on the page is it.
    const og = absolute(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'));
    if (og && !seen.has(og)) add({ src: og, width: null, height: null, alt: null, caption: null, el: null, area: 0, visible: false, og: true });

    return [...seen.values()].sort((a, b) => (b.visible - a.visible) || (b.area - a.area)).slice(0, 120);
  }

  function toCandidate(c) {
    return {
      pageUrl: pageAddress(),
      imageUrl: c.src,
      width: c.width,
      height: c.height,
      alt: c.alt,
      caption: c.caption,
      page: pageFacts(),
    };
  }

  // -------------------------------------------------------------------
  // The layer everything draws in: one closed shadow root, so the page's
  // CSS can't reach in and ours can't leak out.
  // -------------------------------------------------------------------

  let host = null;
  let root = null;

  function ensureFont() {
    if (document.getElementById("clipper-04am-font")) return;
    try {
      const style = document.createElement("style");
      style.id = "clipper-04am-font";
      style.textContent = `@font-face{font-family:"04AM Archivo";src:url("${ext.runtime.getURL("fonts/archivo.woff2")}") format("woff2");font-weight:100 900;font-display:swap}`;
      (document.head || document.documentElement).appendChild(style);
    } catch {
      /* a strict page CSP falls back to the system grotesk */
    }
  }

  function layer() {
    if (host && host.isConnected) return root;
    ensureFont();
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    document.documentElement.appendChild(host);
    return root;
  }

  function teardown() {
    host?.remove();
    host = null;
    root = null;
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      teardown();
    }
  }

  const WORDMARK_PATH =
    "M 49.0 301.0 L 40.0 386.0 L 40.0 460.0 L 46.0 527.0 L 55.0 574.0 L 65.0 609.0 L 82.0 651.0 L 99.0 682.0 L 119.0 710.0 L 143.0 736.0 L 170.0 758.0 L 208.0 780.0 L 242.0 793.0 L 288.0 803.0 L 320.0 806.0 L 370.0 806.0 L 409.0 802.0 L 448.0 793.0 L 482.0 780.0 L 511.0 764.0 L 539.0 743.0 L 570.0 711.0 L 592.0 680.0 L 610.0 646.0 L 915.0 646.0 L 916.0 779.0 L 1104.0 779.0 L 1105.0 646.0 L 1154.0 647.0 L 1109.0 767.0 L 1109.0 779.0 L 1308.0 779.0 L 1355.0 646.0 L 1637.0 646.0 L 1684.0 779.0 L 2018.0 779.0 L 2018.0 274.0 L 2022.0 278.0 L 2175.0 638.0 L 2305.0 639.0 L 2462.0 273.0 L 2463.0 779.0 L 2651.0 779.0 L 2651.0 40.0 L 2402.0 40.0 L 2240.0 417.0 L 2079.0 40.0 L 1830.0 40.0 L 1829.0 622.0 L 1613.0 40.0 L 1378.0 41.0 L 1208.0 500.0 L 1104.0 499.0 L 1104.0 40.0 L 885.0 40.0 L 650.0 389.0 L 643.0 314.0 L 630.0 254.0 L 611.0 202.0 L 595.0 171.0 L 577.0 144.0 L 539.0 103.0 L 501.0 76.0 L 460.0 57.0 L 402.0 43.0 L 370.0 40.0 L 320.0 40.0 L 276.0 45.0 L 222.0 60.0 L 196.0 72.0 L 170.0 88.0 L 142.0 111.0 L 124.0 130.0 L 92.0 176.0 L 70.0 223.0 L 56.0 268.0 Z M 1496.0 237.0 L 1587.0 499.0 L 1586.0 501.0 L 1405.0 500.0 Z M 915.0 222.0 L 916.0 499.0 L 729.0 500.0 L 729.0 497.0 Z M 341.0 178.0 L 363.0 180.0 L 387.0 189.0 L 410.0 208.0 L 423.0 227.0 L 436.0 260.0 L 443.0 291.0 L 449.0 338.0 L 452.0 392.0 L 452.0 451.0 L 448.0 516.0 L 440.0 568.0 L 431.0 600.0 L 417.0 628.0 L 397.0 650.0 L 376.0 662.0 L 350.0 668.0 L 327.0 666.0 L 305.0 658.0 L 293.0 650.0 L 278.0 635.0 L 268.0 620.0 L 254.0 585.0 L 247.0 554.0 L 241.0 508.0 L 238.0 458.0 L 238.0 386.0 L 242.0 326.0 L 249.0 280.0 L 260.0 242.0 L 276.0 213.0 L 294.0 195.0 L 314.0 184.0 Z";

  function wordmark() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 2691 846");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "04AM");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", WORDMARK_PATH);
    path.setAttribute("fill", "currentColor");
    path.setAttribute("fill-rule", "evenodd");
    svg.appendChild(path);
    return svg;
  }

  /** The close X, drawn as two strokes so it is square, centred and sharp. */
  function cross() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const d of ["M1 1 L11 11", "M11 1 L1 11"]) {
      const stroke = document.createElementNS(NS, "path");
      stroke.setAttribute("d", d);
      stroke.setAttribute("stroke", "currentColor");
      stroke.setAttribute("stroke-width", "1.5");
      stroke.setAttribute("fill", "none");
      svg.appendChild(stroke);
    }
    return svg;
  }

  /** Tiny element builder — no innerHTML anywhere near page content. */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  }

  // -------------------------------------------------------------------
  // Picker
  // -------------------------------------------------------------------

  function hostOf(u) {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function openPicker() {
    teardown();
    const r = layer();
    const list = findCandidates();

    const closeButton = el(
      "button",
      { class: "close", type: "button", "aria-label": "Close", title: "Close (Esc)" },
      cross()
    );
    const grid = el("div", { class: "grid" });
    const scroll = el("div", { class: "scroll" }, grid);
    const wrap = el(
      "div",
      { class: "picker", role: "dialog", "aria-label": "Choose an image to clip to 04AM" },
      el("header", {}, el("span", { class: "mark" }, wordmark()), el("span", { class: "kicker" }, "Choose a reference"), closeButton),
      scroll,
      el("footer", {}, "Whole images only. 04AM links to the original — it never keeps a copy.")
    );
    r.appendChild(wrap);
    closeButton.addEventListener("click", teardown);
    closeButton.focus();
    document.addEventListener("keydown", onKey, true);

    if (list.length === 0) {
      grid.replaceWith(
        el(
          "p",
          { class: "empty" },
          "No images large enough to clip on this page.",
          el("span", {}, "Open the work itself — the project page or the full-size image — and try again.")
        )
      );
      return;
    }

    list.forEach((c, i) => {
      const ok = isPublic(c.src);
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = ok ? "tile" : "tile off";
      tile.style.animationDelay = `${Math.min(i * 18, 420)}ms`;
      if (!ok) tile.disabled = true;
      const img = document.createElement("img");
      img.alt = c.alt || "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.src = c.src;
      const meta = document.createElement("span");
      meta.className = "meta";
      const dims = document.createElement("span");
      const setDims = () => {
        // The picker loads the exact address being clipped, so its own
        // natural size is the truth; the page's <img> may be showing a
        // smaller srcset candidate.
        const w = img.naturalWidth || c.width, h = img.naturalHeight || c.height;
        dims.textContent = ok ? (w && h ? `${w} × ${h}` : "") : "Not at a public address";
        if (w && h) {
          c.width = w;
          c.height = h;
        }
      };
      setDims();
      img.addEventListener("load", setDims, { once: true });
      img.addEventListener("error", () => tile.remove(), { once: true });
      const src = document.createElement("span");
      src.textContent = c.og ? "page image" : c.poster ? "video still" : hostOf(c.src);
      meta.append(dims, src);
      tile.append(img, meta);
      if (ok) tile.addEventListener("click", () => openPanel(toCandidate(c)));
      grid.appendChild(tile);
    });
  }

  // -------------------------------------------------------------------
  // Panel: an extension page in an iframe beside the page. The page stays
  // live and scrollable behind it, so a credit line can be read — or
  // copied — while the form is open.
  // -------------------------------------------------------------------

  async function openPanel(candidate) {
    const res = await ext.runtime.sendMessage({ type: "candidate:put", candidate });
    teardown();
    const r = layer();
    const frame = document.createElement("iframe");
    frame.className = "panel";
    frame.title = "Clip to 04AM";
    frame.allow = "clipboard-read; clipboard-write";
    frame.src = ext.runtime.getURL(`panel.html#${encodeURIComponent(res.id)}`);
    r.appendChild(frame);
    document.addEventListener("keydown", onKey, true);
  }

  async function clipSrc(src) {
    const imgs = [...document.images].filter(
      (i) => i.currentSrc === src || i.src === src || (i.getAttribute("srcset") || "").includes(src)
    );
    const img = imgs[0];
    if (img) {
      const best = bestImgSource(img) || src;
      return openPanel(
        toCandidate({ src: best, width: img.naturalWidth || null, height: img.naturalHeight || null, alt: img.alt?.trim() || null, caption: captionFor(img) })
      );
    }
    return openPanel(toCandidate({ src, width: null, height: null, alt: null, caption: null }));
  }

  ext.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "04am:pick") openPicker();
    else if (msg.type === "04am:clip-src" && msg.src) clipSrc(msg.src);
    else if (msg.type === "04am:close") teardown();
  });

  // -------------------------------------------------------------------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .picker, .panel { pointer-events: auto; }
    .picker {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      background: rgba(11,10,14,.965); color: #E7E3D8;
      font: 400 14px/1.4 "04AM Archivo", Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      animation: fade-in 180ms ease-out;
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    }
    header {
      flex: none; height: 64px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      padding: 0 24px; border-bottom: 1px solid rgba(231,227,216,.10);
    }
    .mark { display: block; width: 64px; color: #E7E3D8; line-height: 0; }
    .mark svg { width: 100%; height: auto; display: block; }
    .kicker { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: rgba(231,227,216,.72); }
    /* No box: the X alone, quiet until you reach for it. The 34px target
       stays, it just isn't drawn. */
    .close {
      justify-self: end; display: grid; place-items: center; width: 34px; height: 34px; padding: 0;
      color: rgba(231,227,216,.72); background: none; border: 0; cursor: pointer;
      transition: color 120ms;
    }
    .close svg { display: block; width: 14px; height: 14px; }
    .close:hover { color: #E7E3D8; }
    .close:focus-visible, .tile:focus-visible { outline: 1px solid #E7E3D8; outline-offset: 3px; }
    .scroll { flex: 1; overflow-y: auto; padding: 28px 24px 40px; overscroll-behavior: contain; }
    .grid { columns: 5 220px; column-gap: 18px; max-width: 1600px; margin: 0 auto; }
    .tile {
      display: block; width: 100%; margin: 0 0 22px; padding: 0; border: 0; background: none;
      color: inherit; font: inherit; text-align: left; cursor: pointer; break-inside: avoid;
      animation: float-in 360ms cubic-bezier(.2,.8,.2,1) backwards;
    }
    .tile img {
      display: block; width: 100%; height: auto; max-height: 70vh; object-fit: contain;
      background: #131218; outline: 1px solid transparent; transition: outline-color 120ms, opacity 120ms;
    }
    .tile:hover img { outline-color: rgba(231,227,216,.85); }
    .tile.off { cursor: not-allowed; }
    .tile.off img { opacity: .3; }
    .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 11px; color: rgba(231,227,216,.62); }
    .meta span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty { margin: 18vh auto 0; max-width: 420px; text-align: center; font-size: 18px; line-height: 1.35; }
    .empty span { display: block; margin-top: 10px; font-size: 14px; color: rgba(231,227,216,.62); }
    footer {
      flex: none; padding: 14px 24px; border-top: 1px solid rgba(231,227,216,.10);
      font-size: 12px; color: rgba(231,227,216,.62); text-align: center;
    }
    .panel {
      position: fixed; top: 12px; right: 12px; width: min(400px, calc(100vw - 24px));
      /* An iframe is a replaced element: top + bottom won't stretch it. */
      height: calc(100vh - 24px); height: calc(100dvh - 24px);
      border: 1px solid rgba(231,227,216,.14); border-radius: 6px; background: #0B0A0E;
      box-shadow: 0 24px 80px rgba(0,0,0,.55);
      animation: slide-in 280ms cubic-bezier(.2,.8,.2,1);
      color-scheme: dark;
    }
    @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
    @keyframes float-in { from { opacity: 0; transform: translateY(24px) scale(.96) } to { opacity: 1; transform: none } }
    @keyframes slide-in { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }
    @media (prefers-reduced-motion: reduce) {
      .picker, .tile, .panel { animation: none !important; }
    }
  `;
})();
