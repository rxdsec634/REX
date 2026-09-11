/**
 * Static file server for the site.
 *
 * Serves the repository root (not web/) so that the download links in
 * data/downloads.json can point at the real artifacts in dist-installer/.
 * The site itself lives at /web/.
 *
 *   node web/serve.mjs [port]
 *   → http://localhost:4321/web/index.html
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const PORT = Number(process.argv[2] || process.env.PORT || 4321);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".exe": "application/octet-stream",
  ".deb": "application/vnd.debian.binary-package",
  ".gz": "application/gzip",
  ".dmg": "application/x-apple-diskimage",
  ".zip": "application/zip",
};

createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);

    // Auto-discovery for hero artwork. Drop image files into
    // web/assets/img/art/ and they appear on the site — no JSON to edit.
    // Static hosts cannot list a directory, so `node web/scan-art.mjs`
    // bakes the same listing into data/art.json for production.
    if (rel === "/api/art") {
      const dir = join(ROOT, "web", "assets", "img", "art");
      let slides = [];
      try {
        const names = await readdir(dir);
        slides = names
          .filter((n) => /\.(jpe?g|png|webp|avif|gif)$/i.test(n) && !n.startsWith("_"))
          .sort()
          .map((n) => ({ src: "assets/img/art/" + n, focus: "center" }));
      } catch {
        /* folder missing — no art, which is a valid state */
      }
      const body = JSON.stringify({ slides });
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-cache",
      });
      res.end(body);
      return;
    }

    // Redirect rather than serve the page at "/" — the site's asset paths are
    // relative, so serving web/index.html from the root would resolve them
    // against "/" and 404.
    if (rel === "/") {
      res.writeHead(302, { location: "/web/index.html" }).end();
      return;
    }

    // keep the served path inside ROOT — a request may not climb out with ../
    const abs = normalize(join(ROOT, rel));
    if (abs !== ROOT && !abs.startsWith(ROOT + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let target = abs;
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) target = join(target, "index.html");
    if (!info) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found: " + rel);
      return;
    }

    const size = info.isDirectory() ? (await stat(target)).size : info.size;
    res.writeHead(200, {
      "content-type": TYPES[extname(target).toLowerCase()] || "application/octet-stream",
      "content-length": size,
      "cache-control": "no-cache",
    });
    createReadStream(target).pipe(res);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" }).end(String(err && err.message));
  }
}).listen(PORT, () => {
  console.log(`[web] serving ${ROOT}`);
  console.log(`[web] http://localhost:${PORT}/web/index.html`);
});
