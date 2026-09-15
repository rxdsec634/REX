/* ==================================================================
   Offline shell for the RXDSEC site.
   ------------------------------------------------------------------
   Strategy is split by what the file is, because one strategy for
   everything is always wrong somewhere:

     · documents, scripts, styles, JSON → NETWORK FIRST.
       Cache-first here means a visitor can be pinned to an old build
       forever, and it means every edit during development appears to
       do nothing. The cache is the offline fallback, not the source.

     · images, fonts, icons → CACHE FIRST. They are content-addressed
       in practice and rarely change.

     · installers (.exe/.deb/.dmg/.tar.gz) → never touched. They are
       hundreds of megabytes and have no business in a browser cache.
   ================================================================== */

var VERSION = "rxdsec-v6";

var SHELL = [
  "index.html",
  "rex.html",
  "downloads.html",
  "pricing.html",
  "assets/css/theme.css",
  "assets/css/forms.css",
  "assets/js/icons.js",
  "assets/js/fx.js",
  "assets/js/scene.js",
  "assets/js/downloads.js",
  "assets/js/supabase.js",
  "assets/js/nav-auth.js",
  "assets/img/mark.svg",
  "data/downloads.json",
  "data/profile.json",
  "data/art.json",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches
      .open(VERSION)
      .then(function (c) {
        // one missing entry must not fail the whole install
        return Promise.all(
          SHELL.map(function (u) {
            return c.add(u).catch(function () {});
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== VERSION;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

var MEDIA = /\.(svg|png|jpe?g|webp|avif|gif|ico|woff2?)$/i;
var BULK = /\.(exe|deb|dmg|zip|AppImage|tar\.gz|tgz)$/i;

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }

  if (url.origin !== location.origin) return; // fonts/CDNs handle themselves
  if (BULK.test(url.pathname)) return; // never cache a release artifact

  /* Never touch the API. These responses carry session state, entitlement and
     — on the admin routes — other people's account records. The Cache API
     ignores Cache-Control, so the server's `no-store` does not save us here;
     the only way not to write them to disk is not to handle them.

     The account page is excluded for the same reason: serving a stale copy of
     a signed-in view to whoever opens the browser next is not a cache hit, it
     is a bug. */
  if (url.pathname.indexOf("/api/") === 0) return;
  if (/\/account\.html$/.test(url.pathname)) return;

  function put(res) {
    if (res && res.ok && res.type === "basic") {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) {
        c.put(req, copy);
      });
    }
    return res;
  }

  if (MEDIA.test(url.pathname)) {
    // cache first
    e.respondWith(
      caches.match(req).then(function (hit) {
        return (
          hit ||
          fetch(req)
            .then(put)
            .catch(function () {
              return hit;
            })
        );
      })
    );
    return;
  }

  // network first, cache as the offline fallback
  e.respondWith(
    fetch(req)
      .then(put)
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match("index.html");
        });
      })
  );
});
