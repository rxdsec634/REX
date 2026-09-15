/* ==================================================================
   downloads.html — rendered entirely from data/downloads.json
   ------------------------------------------------------------------
   Add a build or a project by editing that JSON; nothing here changes.
   fetch() of a local file is blocked on file://, so the page also ships
   an inline copy as window.__DOWNLOADS__ and falls back to it — the
   page works double-clicked or served.
   ================================================================== */
(function () {
  "use strict";

  var listEl = document.getElementById("dl-list");
  var tabsEl = document.getElementById("dl-tabs");
  var projEl = document.getElementById("dl-projects");
  var relEl = document.getElementById("dl-release");
  if (!listEl) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function svg(name, size) {
    return '<svg class="icon" width="' + (size || 17) + '" height="' + (size || 17) + '"><use href="#i-' + name + '"/></svg>';
  }

  function human(bytes) {
    if (!bytes) return null;
    var mb = bytes / 1048576;
    return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB";
  }

  function detectOS() {
    var p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    var s = (p + " " + (navigator.userAgent || "")).toLowerCase();
    if (s.indexOf("win") > -1) return "windows";
    if (s.indexOf("mac") > -1 || s.indexOf("iphone") > -1 || s.indexOf("ipad") > -1) return "macos";
    if (s.indexOf("linux") > -1 || s.indexOf("android") > -1) return "linux";
    return "windows";
  }

  var OS_ICON = { windows: "window", macos: "monitor", linux: "terminal", source: "code" };

  function render(data) {
    var builds = data.builds || [];
    var rel = data.release || {};

    if (relEl) {
      relEl.innerHTML =
        '<span class="pill acid">v' + esc(rel.version) + "</span>" +
        '<span class="pill">' + esc(rel.date) + "</span>" +
        '<span class="pill">' + esc(rel.license) + " licence</span>";
    }

    var order = ["windows", "linux", "macos", "source"];
    var groups = {};
    builds.forEach(function (b) {
      (groups[b.os] = groups[b.os] || []).push(b);
    });
    var present = order.filter(function (o) {
      return groups[o] && groups[o].length;
    });

    var active = detectOS();
    if (present.indexOf(active) === -1) active = present[0];

    tabsEl.innerHTML = present
      .map(function (os) {
        return (
          '<button class="os-tab" role="tab" data-os="' + os + '" aria-selected="' + (os === active) + '">' +
          svg(OS_ICON[os] || "download", 15) +
          "<span>" + esc(groups[os][0].osLabel || os) + "</span>" +
          '<span class="cnt">' + groups[os].length + "</span></button>"
        );
      })
      .join("");

    function row(b) {
      var size = human(b.size);
      var pending = b.status === "pending";
      var isRepo = b.status === "repo";

      var facts = [];
      if (size) facts.push("<span>" + esc(size) + "</span>");
      (b.tags || []).forEach(function (t) {
        facts.push("<span>" + esc(t) + "</span>");
      });

      var hash = b.sha256
        ? '<div class="kv"><code title="' + esc(b.sha256) + '">sha256 ' + esc(b.sha256) + "</code>" +
          '<button class="copy-btn" data-copy="' + esc(b.sha256) + '">copy</button></div>'
        : "";

      var install = b.install
        ? '<div class="kv"><code title="' + esc(b.install) + '">' + esc(b.install.split("\n")[0]) + "</code>" +
          '<button class="copy-btn" data-copy="' + esc(b.install) + '">copy</button></div>'
        : "";

      var action;
      if (pending) {
        action = '<span class="btn btn-sm" aria-disabled="true"><span>Not published</span></span>';
      } else if (isRepo) {
        action =
          '<a class="btn btn-sm btn-primary" href="' + esc(b.url) + '" target="_blank" rel="noopener">' +
          "<span>Open repo</span>" + svg("arrowUpRight", 14) + "</a>";
      } else {
        action =
          '<a class="btn btn-sm ' + (b.primary ? "btn-acid" : "btn-primary") + '" href="' + esc(b.url) + '" download>' +
          "<span>Download</span>" + svg("download", 14) + "</a>";
      }

      return (
        '<article class="dl-row ' + (b.primary ? "primary" : "") + '">' +
        "<div>" +
        '<div class="dl-head"><h3>' + esc(b.title) + "</h3>" +
        (b.primary ? '<span class="pill acid">recommended</span>' : "") +
        (pending ? '<span class="pill">planned</span>' : "") +
        "</div>" +
        "<p>" + esc(b.subtitle) + "</p>" +
        (b.note ? '<p class="small" style="margin-top:8px">' + esc(b.note) + "</p>" : "") +
        (facts.length ? '<div class="dl-facts">' + facts.join("") + "</div>" : "") +
        install + hash +
        "</div>" +
        '<div class="dl-side">' + action +
        (b.verify ? '<button class="btn btn-sm" data-copy="' + esc(b.verify) + '"><span>Verify cmd</span></button>' : "") +
        "</div>" +
        "</article>"
      );
    }

    function paint(os) {
      listEl.innerHTML = (groups[os] || []).map(row).join("");
      Array.prototype.forEach.call(tabsEl.querySelectorAll(".os-tab"), function (t) {
        t.setAttribute("aria-selected", String(t.getAttribute("data-os") === os));
      });
    }

    paint(active);

    tabsEl.addEventListener("click", function (e) {
      var t = e.target.closest(".os-tab");
      if (t) paint(t.getAttribute("data-os"));
    });

    /* ---------- projects, as index rows ---------- */
    if (projEl) {
      var n = 0;
      var rows = (data.projects || [])
        .map(function (p) {
          n++;
          var size = human(p.size);
          var href = p.url || p.repo || "#";
          var ext = /^https?:/.test(href);
          var isAnchor = href.charAt(0) === "#";
          return (
            '<a class="irow" href="' + esc(href) + '"' +
            (ext ? ' target="_blank" rel="noopener"' : isAnchor ? "" : " download") + ">" +
            '<span class="irow-n">' + String(n).padStart(3, "0") + "</span>" +
            "<span><span class=\"irow-t\">" + esc(p.name) + "</span>" +
            '<span class="irow-tags">' +
            (p.kind ? "<span>" + esc(p.kind) + "</span>" : "") +
            (size ? "<span>" + esc(size) + "</span>" : "") +
            (p.tags || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") +
            "</span></span>" +
            '<span class="irow-d irow-meta-cell">' + esc(p.blurb) + "</span>" +
            '<span class="irow-go">' + svg("arrowUpRight", 17) + "</span>" +
            "</a>"
          );
        })
        .join("");

      projEl.innerHTML = rows;

      var slot = document.getElementById("dl-slot");
      if (slot) {
        slot.innerHTML =
          "<b>Your next release goes here</b>" +
          'Drop the file in <code class="mono">web/files/</code> and add an entry to ' +
          '<code class="mono">web/data/downloads.json</code> — this page picks it up on reload.';
      }
    }
  }

  function boot(data) {
    try {
      render(data);
    } catch (err) {
      listEl.innerHTML = '<div class="slot"><b>Could not render the download list</b>' + esc(err.message) + "</div>";
    }
  }

  /* ------------------------ live release lookup ------------------------ */
  /* The manifest names the builds; GitHub knows where they actually are.
     Keeping both by hand is what produced a page advertising
     /releases/download/v0.2.4/ while the release was tagged `rex`, and
     checksums belonging to a build that had since been replaced.

     So: ask the API which assets exist, and take the URL, the size and the
     digest from the answer. The manifest still supplies everything GitHub has
     no opinion about — the wording, the install command, the ordering.

     Unauthenticated calls are rate-limited per IP, and a release may not exist
     at all, so every failure here falls back to the manifest rather than
     emptying the page. */
  var GH_API = "https://api.github.com/repos/rxdsec634/REX/releases/latest";

  /* Match an asset to a build by file name. The manifest's `title` is the
     name on disk; GitHub replaces spaces with dots on upload, so compare with
     that substitution applied rather than requiring an exact match. */
  function assetFor(assets, build) {
    var want = String(build.title || "").replace(/ /g, ".").toLowerCase();
    if (!want) return null;
    for (var i = 0; i < assets.length; i++) {
      if (String(assets[i].name || "").toLowerCase() === want) return assets[i];
    }
    return null;
  }

  function applyRelease(data, release) {
    var assets = (release && release.assets) || [];
    if (!assets.length) return data;

    var used = 0;
    (data.builds || []).forEach(function (b) {
      var a = assetFor(assets, b);
      if (!a) return;
      used++;
      b.url = a.browser_download_url;
      if (typeof a.size === "number") b.size = a.size;
      // "sha256:abc…" — the prefix names the algorithm, so check it rather
      // than assuming, and drop a digest in anything else.
      var d = String(a.digest || "");
      if (d.slice(0, 7).toLowerCase() === "sha256:") b.sha256 = d.slice(7);
      delete b.status; // it is published, whatever the manifest guessed
    });

    if (used && release.tag_name) {
      data.release = data.release || {};
      data.release.tag = release.tag_name;
    }
    return data;
  }

  /* Supabase is the address of record.
     It is edited in one place, by the owner, and takes effect without a deploy
     — which is the point. GitHub stays as the fallback because it knows where
     the assets really are when the table has not been filled in yet, and the
     manifest stays behind that because a page that shows nothing is worse than
     a page showing a stale address.

     Matching is by platform + kind, which is how the manifest already
     distinguishes an installer from a portable build on the same OS. */
  var KIND_BY_ID = {
    "win32-installer": { platform: "win32", kind: "installer" },
    "win32-portable": { platform: "win32", kind: "portable" },
    "linux-deb": { platform: "linux", kind: "deb" },
    "linux-tarball": { platform: "linux", kind: "tarball" },
    macos: { platform: "darwin", kind: null },
  };

  function applySupabase(data, rows) {
    if (!rows || !rows.length) return { data: data, used: 0 };
    var used = 0;

    (data.builds || []).forEach(function (b) {
      var want = KIND_BY_ID[b.id];
      if (!want) return;
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].platform !== want.platform) continue;
        if (want.kind && rows[i].kind && rows[i].kind !== want.kind) continue;
        row = rows[i]; // ordered newest first, so the first match is the one
        break;
      }
      if (!row || !row.url) return;
      used++;
      b.url = row.url;
      if (typeof row.size === "number") b.size = row.size;
      if (row.sha256) b.sha256 = row.sha256;
      if (row.version) b.title = String(b.title || "").replace(/\d+\.\d+\.\d+/, row.version);
      delete b.status;
    });

    if (used && rows[0].version) {
      data.release = data.release || {};
      data.release.version = rows[0].version;
    }
    return { data: data, used: used };
  }

  function withSupabase(data) {
    if (!window.SB || !window.SB.listReleases) return Promise.resolve({ data: data, used: 0 });
    return window.SB.listReleases("stable")
      .then(function (rows) {
        return applySupabase(data, rows);
      })
      .catch(function () {
        // Table missing, project paused, offline — all the same answer here.
        return { data: data, used: 0 };
      });
  }

  function withGitHub(data) {
    return fetch(GH_API, { cache: "no-cache", headers: { accept: "application/vnd.github+json" } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (rel) {
        return rel ? applyRelease(data, rel) : data;
      })
      .catch(function () {
        // Rate-limited, offline, or no release yet. The manifest is still a
        // correct description of what was built; only the addresses may be
        // stale, and a stale address beats an empty page.
        return data;
      });
  }

  if (location.protocol === "file:" && window.__DOWNLOADS__) {
    boot(window.__DOWNLOADS__);
    return;
  }

  fetch("data/downloads.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      return withSupabase(data).then(function (r) {
        // Only ask GitHub when the table had nothing to say. Two sources
        // racing to set the same field is how they end up disagreeing.
        return r.used ? r.data : withGitHub(r.data);
      });
    })
    .then(boot)
    .catch(function () {
      if (window.__DOWNLOADS__) boot(window.__DOWNLOADS__);
      else listEl.innerHTML = '<div class="slot"><b>Manifest unavailable</b>data/downloads.json could not be loaded.</div>';
    });
})();
