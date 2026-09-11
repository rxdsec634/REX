/**
 * Bake the hero artwork listing into data/art.json.
 *
 *   node web/scan-art.mjs
 *
 * The dev server can list assets/img/art/ live over /api/art, but a static
 * host cannot list a directory — so run this once before deploying and the
 * same listing ships as data. Existing per-slide settings (focus, and any
 * keys you have added) are preserved by src; new files are appended; entries
 * whose file has been deleted are dropped.
 *
 * Top-level settings — interval, fade, dim — are never touched.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ART_DIR = join(HERE, "assets", "img", "art");
const MANIFEST = join(HERE, "data", "art.json");

const IMAGE = /\.(jpe?g|png|webp|avif|gif)$/i;

const cfg = JSON.parse(await readFile(MANIFEST, "utf8"));

let names = [];
try {
  names = await readdir(ART_DIR);
} catch {
  console.error(`[art] ${ART_DIR} does not exist — nothing to scan.`);
  process.exit(1);
}

// files starting with _ are scratch, the same convention the server uses
const found = names.filter((n) => IMAGE.test(n) && !n.startsWith("_")).sort();

// keep whatever the author already configured for a slide they still have
const previous = new Map(
  (Array.isArray(cfg.slides) ? cfg.slides : [])
    .map((s) => (typeof s === "string" ? { src: s } : s))
    .filter((s) => s && s.src)
    .map((s) => [s.src, s])
);

const slides = found.map((n) => {
  const src = `assets/img/art/${n}`;
  return previous.get(src) || { src, focus: "center" };
});

const dropped = [...previous.keys()].filter((src) => !slides.some((s) => s.src === src));

cfg.slides = slides;
await writeFile(MANIFEST, JSON.stringify(cfg, null, 2) + "\n", "utf8");

console.log(`[art] ${slides.length} slide${slides.length === 1 ? "" : "s"} written to data/art.json`);
for (const s of slides) console.log(`      ${s.src}`);
for (const src of dropped) console.log(`      removed (file gone): ${src}`);
if (!slides.length) console.log(`      drop images into web/assets/img/art/ and run this again`);
