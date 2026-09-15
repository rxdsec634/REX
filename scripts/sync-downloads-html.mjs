/**
 * Rewrite the inline manifest in web/downloads.html from web/data/downloads.json.
 *
 *   node scripts/sync-downloads-html.mjs [--check]
 *
 * The download page carries a copy of the manifest inside a <script> tag so it
 * still works over file://, where fetch() of a sibling JSON file is blocked.
 * Two copies of the same data drift, and when they drift the page offers a
 * checksum that does not match the file — the single most damaging thing a
 * download page can get wrong, because it teaches people to ignore checksums.
 *
 * So it is generated, not hand-edited. `--check` exits non-zero if they differ,
 * which is what you want in CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/* The site used to live under web/ and now sits at the repository root. Look
   for it in both places rather than hard-coding one, so this keeps working
   wherever the pages are — a stale path here means the inline manifest is
   never regenerated and silently drifts from the JSON, which is how the page
   ends up publishing a checksum that does not match the file. */
function locate(...parts) {
  const flat = path.join(ROOT, ...parts);
  if (fs.existsSync(flat)) return flat;
  const nested = path.join(ROOT, "web", ...parts);
  if (fs.existsSync(nested)) return nested;
  return flat;
}

const HTML = locate("downloads.html");
const JSON_FILE = locate("data", "downloads.json");

const check = process.argv.includes("--check");

const manifest = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
let html = fs.readFileSync(HTML, "utf8");

const OPEN = '<script id="dl-fallback">';
const start = html.indexOf(OPEN);
if (start < 0) {
  console.error('Could not find <script id="dl-fallback"> in web/downloads.html.');
  process.exit(1);
}
const end = html.indexOf("</script>", start);
if (end < 0) {
  console.error("Unterminated dl-fallback script block.");
  process.exit(1);
}

/* "</script>" inside a JSON string would close the block early — the classic
   way an inline data island turns into an HTML injection. Nothing in a
   filename should contain it, but generating the escape is free. */
const body = JSON.stringify(manifest, null, 2).replace(/<\//g, "<\\/");
const block = `${OPEN}\nwindow.__DOWNLOADS__ = ${body};\n`;

const next = html.slice(0, start) + block + html.slice(end);

if (check) {
  if (next !== html) {
    console.error("web/downloads.html is out of sync with web/data/downloads.json.");
    console.error("Run: node scripts/sync-downloads-html.mjs");
    process.exit(1);
  }
  console.log("downloads.html is in sync.");
  process.exit(0);
}

/* Keep the human-readable copy on the page honest too: the version appears in
   the meta description and in the example commands. */
const version = manifest.release?.version;
let out = next;
if (version) {
  const names = (manifest.builds || []).map((b) => b.title).filter(Boolean);
  const pick = (re) => names.find((n) => re.test(n));
  const winInstaller = pick(/^REX Setup /) || `REX Setup ${version}.exe`;
  const winPortable = pick(/^REX \d/) || `REX ${version}.exe`;
  const deb = pick(/\.deb$/) || `rex_${version}_amd64.deb`;
  const tarball = pick(/\.tar\.gz$/) || `rex-${version}-linux-x64.tar.gz`;

  // Only the parts outside the generated block: replace old version strings in
  // the prose and the example commands.
  const head = out.slice(0, out.indexOf(OPEN));
  const tail = out.slice(out.indexOf(OPEN));
  const fixed = head
    .replace(/REX Setup \d[\d.]*\.exe/g, winInstaller)
    .replace(/REX \d[\d.]*\.exe/g, winPortable)
    .replace(/rex_\d[\d.]*_amd64\.deb/g, deb)
    .replace(/rex-\d[\d.]*-linux-x64\.tar\.gz/g, tarball)
    .replace(/REX \d+\.\d+\.\d+ for Windows/g, `REX ${version} for Windows`);
  out = fixed + tail;
}

fs.writeFileSync(HTML, out);
console.log(`Synced web/downloads.html from downloads.json (version ${version}).`);
