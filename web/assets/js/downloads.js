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

  if (location.protocol === "file:" && window.__DOWNLOADS__) {
    boot(window.__DOWNLOADS__);
    return;
  }

  fetch("data/downloads.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(boot)
    .catch(function () {
      if (window.__DOWNLOADS__) boot(window.__DOWNLOADS__);
      else listEl.innerHTML = '<div class="slot"><b>Manifest unavailable</b>data/downloads.json could not be loaded.</div>';
    });
})();
