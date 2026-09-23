import { ask, mountMarks, wireSignIn } from "./ui.js";

mountMarks();

const out = document.querySelector('[data-state="signed-out"]');
const inn = document.querySelector('[data-state="signed-in"]');

function show(signedIn, name) {
  out.hidden = signedIn;
  inn.hidden = !signedIn;
  if (name) inn.querySelector("[data-name]").textContent = `@${name}`;
}

async function refresh() {
  const s = await ask("session:get");
  show(!!s.signedIn, s.name);
  for (const r of document.querySelectorAll('input[name="origin"]')) r.checked = r.value === s.origin;
}

wireSignIn(out.querySelector("[data-signin]"), { onSignedIn: (name) => show(true, name) });

inn.querySelector("[data-signout]").addEventListener("click", async () => {
  await ask("session:signout");
  show(false);
});

for (const r of document.querySelectorAll('input[name="origin"]')) {
  r.addEventListener("change", async () => {
    await ask("origin:set", { value: r.value });
    await refresh();
  });
}

await refresh();
