import { ask, mountMarks, wireSignIn } from "./ui.js";

mountMarks();

const out = document.querySelector('[data-state="signed-out"]');
const inn = document.querySelector('[data-state="signed-in"]');

function show(state, name) {
  out.hidden = state !== "out";
  inn.hidden = state !== "in";
  if (name) inn.querySelector("[data-name]").textContent = `@${name}`;
  if (state === "out") out.querySelector("#email").focus();
}

const session = await ask("session:get");
for (const a of document.querySelectorAll("[data-site-link]")) {
  a.href = `${session.origin ?? "https://gradient-flax.vercel.app"}${a.dataset.siteLink}`;
}
show(session.signedIn ? "in" : "out", session.name);

wireSignIn(out.querySelector("[data-signin]"), { onSignedIn: (name) => show("in", name) });

inn.querySelector("[data-pick]").addEventListener("click", async () => {
  await ask("picker:open");
  window.close();
});

inn.querySelector("[data-signout]").addEventListener("click", async () => {
  await ask("session:signout");
  show("out");
});
