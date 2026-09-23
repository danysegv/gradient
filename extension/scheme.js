// Tells the background whether the browser is light or dark, now and
// whenever it changes, so the toolbar wordmark is Ink or Bone to match.
const mq = matchMedia("(prefers-color-scheme: dark)");
const tell = () => chrome.runtime.sendMessage({ type: "scheme:set", dark: mq.matches }).catch(() => {});
tell();
mq.addEventListener("change", tell);
