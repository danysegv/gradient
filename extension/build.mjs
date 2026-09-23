// Builds store-ready copies of the extension, one per browser.
//
//   node extension/build.mjs            → extension/dist/<browser>/ + .zip
//
// The source folder itself loads unpacked in every browser (its manifest
// carries both background keys and Firefox's settings, which the others
// ignore). The stores are stricter, so each build keeps only what that
// browser reads. No dependencies: the zip is written by hand below.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const SHIP = [
  "manifest.json", "background.js", "content.js", "ui.js", "ui.css",
  "popup.html", "popup.css", "popup.js", "options.html", "options.css", "options.js",
  "panel.html", "panel.css", "panel.js", "scheme.html", "scheme.js", "icons", "fonts",
];

const base = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

const flavours = {
  chrome(m) {
    delete m.browser_specific_settings;
    m.background = { service_worker: "background.js" };
    return m;
  },
  edge(m) {
    return flavours.chrome(m);
  },
  firefox(m) {
    // Firefox's event page reads the colour scheme itself: no offscreen page.
    m.background = { scripts: ["background.js"] };
    m.permissions = m.permissions.filter((p) => p !== "offscreen");
    return m;
  },
  safari(m) {
    delete m.browser_specific_settings;
    // A non-persistent page rather than a service worker, so it can read
    // the colour scheme for the toolbar icon (Safari has no offscreen API).
    m.background = { scripts: ["background.js"], persistent: false };
    m.permissions = m.permissions.filter((p) => p !== "offscreen");
    return m;
  },
};

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function zip(dir, out) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const full of files(dir).sort()) {
    const name = Buffer.from(relative(dir, full).split("\\").join("/"));
    const data = readFileSync(full);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0, 6);
    head.writeUInt16LE(8, 8);
    head.writeUInt32LE(0x00210000, 10); // 1980-01-01, fixed so builds are reproducible
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    local.push(head, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(0x00210000, 12);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += head.length + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(out, Buffer.concat([...local, cd, end]));
}

rmSync(dist, { recursive: true, force: true });
for (const [browser, flavour] of Object.entries(flavours)) {
  const out = join(dist, browser);
  mkdirSync(out, { recursive: true });
  for (const f of SHIP) if (f !== "manifest.json") cpSync(join(here, f), join(out, f), { recursive: true });
  const manifest = flavour(structuredClone(base));
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const zipPath = join(dist, `04am-clipper-${browser}-${base.version}.zip`);
  zip(out, zipPath);
  console.log(`${browser.padEnd(8)} ${relative(process.cwd(), zipPath)}`);
}
