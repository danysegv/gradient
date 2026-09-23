import { ask, ext, mountMarks } from "./ui.js";

// The form beside the page. Everything it shows about the work comes from
// the page itself or from 04AM; nothing is guessed here.
//
// Two rules carried from the site:
//   · Credits the page offers are SUGGESTIONS (dashed chips), never
//     pre-filled. A typed credit is a person's judgement and is stored as
//     one; a blank is read from the work later by the classifier, which
//     marks it as inferred. Pre-filling would blur that line.
//   · found_via is a fact about the address, answered by 04AM from the
//     same list the classifier uses — not typed, not guessed.

mountMarks();

const $ = (s) => document.querySelector(s);
const form = $("form[data-view=form]");
const saveButton = $("[data-save]");
const errorEl = $("[data-error]");
let candidate = null;
let blocked = false;

function view(name) {
  for (const el of document.querySelectorAll("[data-view]")) el.hidden = el.dataset.view !== name;
}

function close() {
  ask("panel:close");
}

$("[data-close]").addEventListener("click", close);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !$("[data-view=form]").hidden) save();
});

function message(title, body, actions = []) {
  $("[data-message-title]").textContent = title;
  $("[data-message-body]").textContent = body;
  const box = $("[data-message-actions]");
  box.replaceChildren(
    ...actions.map(([label, fn, quiet]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = quiet ? "button quiet" : "button";
      b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    })
  );
  view("message");
}

function signedOut() {
  message("Signed out.", "Sign in again to keep clipping. Nothing was saved.", [
    ["Sign in", () => ext.runtime.openOptionsPage()],
    ["Close", close, true],
  ]);
}

// ---------------------------------------------------------------------

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Signed CDN addresses stop working after a while — Instagram's in days. */
function looksTemporary(u) {
  try {
    const url = new URL(u);
    if (/(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname)) return true;
    return [...url.searchParams.keys()].some((k) =>
      /^(oe|x-amz-expires|x-amz-signature|expires|se|exp|token|sig|signature|policy|key-pair-id)$/i.test(k)
    );
  } catch {
    return false;
  }
}

/** "Poster Series on Behance" → "Poster Series"; "Work | Studio" → "Work". */
function cleanTitle(title, siteName) {
  if (!title) return "";
  let t = title.trim();
  const names = [siteName, "Behance", "Dribbble", "Pinterest", "Instagram", "Are.na", "Cosmos"].filter(Boolean);
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s+(on|via)\\s+${esc}\\s*$`, "i"), "");
    t = t.replace(new RegExp(`\\s*[|·•–—-]\\s*${esc}\\s*$`, "i"), "");
  }
  return t.slice(0, 500);
}

function chip(field, value, prefix = "From the page") {
  const shown = value.length > 80 ? `${value.slice(0, 80)}…` : value;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.title = `Use “${value}”`;
  const s = document.createElement("span");
  s.textContent = `${prefix}: `;
  b.append(s, document.createTextNode(shown));
  b.addEventListener("click", () => {
    const input = form.elements[field];
    input.value = value;
    input.focus();
    b.remove();
  });
  $(`[data-suggest="${field}"]`).appendChild(b);
}

/** A ruled line above the fields: a bold lead, then plain words. */
function notice(lead, rest = "") {
  const p = document.createElement("p");
  p.className = "notice";
  if (lead) {
    const b = document.createElement("strong");
    b.textContent = lead;
    p.append(b, rest ? " " : "");
  }
  p.append(rest);
  $("[data-notices]").appendChild(p);
  return p;
}

function when(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------

async function start() {
  const id = decodeURIComponent(location.hash.slice(1));
  const res = await ask("candidate:take", { id });
  candidate = res.candidate;
  if (!candidate) {
    message("That one slipped away.", "Choose the image again.", [["Choose again", () => ask("panel:again")], ["Close", close, true]]);
    return;
  }

  const session = await ask("session:get");
  const img = $("[data-image]");
  img.src = candidate.imageUrl;
  img.alt = candidate.alt || "";
  const setDims = () => {
    const w = img.naturalWidth || candidate.width, h = img.naturalHeight || candidate.height;
    $("[data-dims]").textContent = w && h ? `${w} × ${h}` : "";
  };
  setDims();
  img.addEventListener("load", setDims, { once: true });
  img.addEventListener("error", () => {
    notice("This image didn't load here.", "It may not load on 04AM either — some sites refuse to be linked to.");
  }, { once: true });
  $("[data-host]").textContent = hostOf(candidate.imageUrl);

  const page = candidate.page ?? {};
  form.elements.title.value = cleanTitle(page.title || candidate.alt || "", page.siteName);
  for (const p of page.people ?? []) chip("creator", p);
  if (candidate.caption) chip("caption", candidate.caption, "Caption");

  if (looksTemporary(candidate.imageUrl)) {
    notice("This address looks temporary.", "Signed links like this one often stop loading within days. If the work is also on the maker's own site, clip it there.");
  }

  view("form");
  form.elements.creator.focus();

  if (!session.signedIn) return signedOut();

  const look = await ask("clip:lookup", { url: candidate.pageUrl, image_url: candidate.imageUrl });
  if (look.status === 401) return signedOut();
  const info = look.body ?? {};

  if (info.existing) {
    blocked = true;
    const by = info.existing.clipped_by_name ? ` by @${info.existing.clipped_by_name}` : "";
    const on = info.existing.clipped_at ? ` on ${when(info.existing.clipped_at)}` : "";
    const n = notice("Already in the library.", `Clipped${by}${on}.`);
    const a = document.createElement("a");
    a.href = `${session.origin}/clip/${encodeURIComponent(info.existing.id)}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "View ↗";
    n.appendChild(a);
    saveButton.disabled = true;
    saveButton.textContent = "Already clipped";
    $(".hint").textContent = "The same image twice would count twice in every figure.";
  } else if (info.from_this_page > 0) {
    notice("", `${info.from_this_page === 1 ? "One clip already comes" : `${info.from_this_page} clips already come`} from this page.`);
  }

  if (info.found_via) {
    const fact = $("[data-found-via-fact]");
    fact.hidden = false;
    fact.textContent = info.found_via;
    const change = document.createElement("button");
    change.type = "button";
    change.className = "link";
    change.textContent = "from the address";
    change.title = "04AM reads this from the page address. Type over it only if it's wrong.";
    change.addEventListener("click", () => {
      fact.hidden = true;
      form.elements.found_via.hidden = false;
      form.elements.found_via.value = info.found_via;
      form.elements.found_via.focus();
    });
    fact.appendChild(change);
    form.elements.found_via.hidden = true;
  } else if (page.siteName) {
    // Not a known finder, so this is often the maker's or publisher's own
    // site — a candidate rights holder, offered, never assumed.
    chip("rights_holder", page.siteName, "This site");
  }
}

async function save() {
  if (blocked || saveButton.disabled || !candidate) return;
  errorEl.textContent = "";
  saveButton.disabled = true;
  saveButton.textContent = "Clipping…";
  const f = form.elements;
  const clip = {
    url: candidate.pageUrl,
    image_url: candidate.imageUrl,
    title: f.title.value,
    creator: f.creator.value,
    rights_holder: f.rights_holder.value,
    // Left blank when 04AM already knows it from the address: the pipeline
    // fills it and marks it as read, not typed.
    found_via: f.found_via.hidden ? "" : f.found_via.value,
    source_year: f.source_year.value,
    caption: f.caption.value,
  };
  const res = await ask("clip:save", { clip });
  saveButton.disabled = false;
  saveButton.textContent = "Clip it";
  if (res.status === 201) {
    $("[data-view-link]").href = res.body.href;
    view("done");
    return;
  }
  if (res.status === 401) return signedOut();
  errorEl.textContent = res.body?.error ?? res.error ?? "Something went wrong. Try again.";
}

saveButton.addEventListener("click", save);
// Enter in a field never clips by accident; ⌘↵ or the button does.
form.addEventListener("submit", (e) => e.preventDefault());
$("[data-again]").addEventListener("click", () => ask("panel:again"));

start();
