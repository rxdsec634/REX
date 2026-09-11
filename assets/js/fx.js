/* ==================================================================
   RXDSEC — interaction layer
   ------------------------------------------------------------------
   Preloader, magnetic cursor, split-text reveals, decode/scramble
   headings, scroll progress, tilt-with-glare, counters, marquee,
   mobile drawer, and cross-page transitions.

   Rules this file follows:
     · every effect is opt-in via a data- attribute, so the HTML stays
       readable and nothing is applied by surprise
     · every effect no-ops under prefers-reduced-motion or coarse
       pointers rather than degrading into something worse
     · nothing may ever leave content permanently invisible
   ================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var root = document.documentElement;

  var raf = window.requestAnimationFrame.bind(window);
  var $ = function (s, c) {
    return (c || document).querySelector(s);
  };
  var $$ = function (s, c) {
    return Array.prototype.slice.call((c || document).querySelectorAll(s));
  };

  /* ============================================================
     1. Preloader
     ============================================================ */
  (function preloader() {
    var pre = $(".preloader");
    if (!pre) return;

    var bar = $(".pre-bar i", pre);
    var pct = $(".pre-pct", pre);
    var done = false;
    var shown = 0;

    function finish() {
      if (done) return;
      done = true;
      shown = 100;
      if (bar) bar.style.width = "100%";
      if (pct) pct.textContent = "100";
      setTimeout(function () {
        pre.classList.add("gone");
        root.classList.add("ready");
        // let the entrance run only once the curtain is actually moving
        setTimeout(function () {
          pre.remove();
        }, 900);
      }, 260);
    }

    // Fake-free progress: count real resources as they land, and hold a
    // floor so the bar always moves even on a warm cache.
    var start = performance.now();
    (function tick() {
      if (done) return;
      var res = performance.getEntriesByType ? performance.getEntriesByType("resource").length : 0;
      var byRes = Math.min(res / 12, 1);
      var byTime = Math.min((performance.now() - start) / 1400, 1);
      var target = Math.max(byRes, byTime) * 96;
      shown += (target - shown) * 0.12;
      if (bar) bar.style.width = shown.toFixed(1) + "%";
      if (pct) pct.textContent = String(Math.round(shown));
      raf(tick);
    })();

    if (document.readyState === "complete") setTimeout(finish, 300);
    else window.addEventListener("load", function () {
      setTimeout(finish, 300);
    });
    // never hold the page hostage to a slow font or CDN
    setTimeout(finish, 4000);
  })();

  /* ============================================================
     2. Magnetic cursor
     ============================================================ */
  (function cursor() {
    var cur = $(".cursor");
    if (!cur) return;
    if (!fine || reduced) {
      cur.remove();
      return;
    }
    root.classList.add("has-cursor");

    var dot = $(".cursor-dot", cur);
    var ring = $(".cursor-ring", cur);

    var mx = window.innerWidth / 2,
      my = window.innerHeight / 2;
    var rx = mx,
      ry = my;
    var snap = null;

    window.addEventListener(
      "pointermove",
      function (e) {
        mx = e.clientX;
        my = e.clientY;
      },
      { passive: true }
    );

    // The ring latches onto whatever interactive thing is under it and
    // takes that element's shape — the pointer stops being a dot on top
    // of a button and becomes the button's own outline.
    var MAGNET = "a, button, .btn, .icon-btn, .os-tab, .toolcell, .contact-card, .irow, .panel, [data-magnet]";
    document.addEventListener(
      "pointerover",
      function (e) {
        var t = e.target.closest ? e.target.closest(MAGNET) : null;
        snap = t || null;
        cur.classList.toggle("snapped", !!t);
      },
      { passive: true }
    );
    document.addEventListener(
      "pointerout",
      function (e) {
        if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(MAGNET)) {
          snap = null;
          cur.classList.remove("snapped");
        }
      },
      { passive: true }
    );

    document.addEventListener("pointerdown", function () {
      cur.classList.add("down");
    });
    document.addEventListener("pointerup", function () {
      cur.classList.remove("down");
    });
    document.addEventListener("pointerleave", function () {
      cur.style.opacity = "0";
    });
    document.addEventListener("pointerenter", function () {
      cur.style.opacity = "";
    });

    (function loop() {
      raf(loop);
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";

      if (snap && snap.isConnected) {
        var r = snap.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        rx += (cx - rx) * 0.22;
        ry += (cy - ry) * 0.22;
        ring.style.width = r.width + 10 + "px";
        ring.style.height = r.height + 10 + "px";
        ring.style.borderRadius = getComputedStyle(snap).borderRadius || "12px";
      } else {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        ring.style.width = "38px";
        ring.style.height = "38px";
        ring.style.borderRadius = "50%";
      }
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0) translate(-50%,-50%)";
    })();
  })();

  /* ============================================================
     3. Scroll progress
     ============================================================ */
  (function progress() {
    var el = $(".scroll-progress i");
    if (!el) return;
    var ticking = false;
    function update() {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? window.scrollY / max : 0;
      el.style.transform = "scaleX(" + p.toFixed(4) + ")";
    }
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        raf(update);
      },
      { passive: true }
    );
    update();
  })();

  /* ============================================================
     4. Split text — data-split="chars" | "words" | "lines"
     ============================================================ */
  function split(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";
    var mode = el.getAttribute("data-split") || "words";
    var html = "";
    var idx = 0;

    // Walk the original children so inline markup (a highlighted span,
    // a <br>) survives the split instead of being flattened to text.
    Array.prototype.forEach.call(el.childNodes, function (node) {
      if (node.nodeType === 3) {
        var text = node.textContent;
        if (mode === "chars") {
          html += text.replace(/\S/g, function (ch) {
            return '<span class="sp" style="--i:' + idx++ + '">' + ch + "</span>";
          });
        } else {
          html += text
            .split(/(\s+)/)
            .map(function (w) {
              if (!w.trim()) return w;
              return '<span class="sp" style="--i:' + idx++ + '">' + w + "</span>";
            })
            .join("");
        }
      } else if (node.nodeType === 1) {
        if (node.tagName === "BR") {
          html += "<br>";
          return;
        }
        var inner = node.textContent;
        var parts =
          mode === "chars"
            ? inner.replace(/\S/g, function (ch) {
                return '<span class="sp" style="--i:' + idx++ + '">' + ch + "</span>";
              })
            : inner
                .split(/(\s+)/)
                .map(function (w) {
                  if (!w.trim()) return w;
                  return '<span class="sp" style="--i:' + idx++ + '">' + w + "</span>";
                })
                .join("");
        var clone = node.cloneNode(false);
        clone.innerHTML = parts;
        html += clone.outerHTML;
      }
    });

    el.innerHTML = html;
    el.classList.add("split");
  }

  if (!reduced) $$("[data-split]").forEach(split);

  /* ============================================================
     5. Reveal — the single observer everything else hangs off
     ============================================================ */
  var GLYPHS = "▚�ञ01<>/\\{}[]#$%&*+=~ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function scramble(el) {
    if (el.dataset.scrambled) return;
    el.dataset.scrambled = "1";
    var final = el.textContent;
    var len = final.length;
    var start = performance.now();
    var dur = Math.min(120 + len * 26, 1100);

    (function step(now) {
      var p = Math.min((now - start) / dur, 1);
      var settled = Math.floor(p * len);
      var out = "";
      for (var i = 0; i < len; i++) {
        var c = final[i];
        if (i < settled || c === " ") out += c;
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) raf(step);
      else el.textContent = final;
    })(start);
  }

  var revealables = $$(".reveal, [data-split], [data-scramble]");

  function show(el) {
    el.classList.add("in");
    if (el.hasAttribute("data-scramble")) scramble(el);
    $$("[data-scramble]", el).forEach(scramble);
    $$(".meter i[data-w]", el).forEach(function (m) {
      m.style.width = m.getAttribute("data-w") + "%";
    });
    $$("[data-count]", el).forEach(count);
  }

  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          show(en.target);
          io.unobserve(en.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    revealables.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealables.forEach(show);
  }

  // Safety net — a throttled tab, a print job or a browser without IO
  // must never leave the page blank.
  setTimeout(function () {
    revealables.forEach(function (el) {
      if (!el.classList.contains("in")) show(el);
    });
  }, 3000);

  /* ============================================================
     6. Counters
     ============================================================ */
  function count(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";
    var to = parseFloat(el.getAttribute("data-count"));
    var dec = (el.getAttribute("data-count").split(".")[1] || "").length;
    if (reduced) {
      el.textContent = to.toFixed(dec);
      return;
    }
    var start = performance.now();
    (function step(now) {
      var p = Math.min((now - start) / 1400, 1);
      el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(dec);
      if (p < 1) raf(step);
    })(start);
  }
  // counters that aren't inside a .reveal still need starting
  $$("[data-count]").forEach(function (el) {
    if (!el.closest(".reveal, [data-split]")) {
      if ("IntersectionObserver" in window && !reduced) {
        var o = new IntersectionObserver(
          function (e) {
            if (!e[0].isIntersecting) return;
            o.disconnect();
            count(el);
          },
          { threshold: 0.4 }
        );
        o.observe(el);
      } else count(el);
    }
  });

  /* ============================================================
     7. Tilt with glare
     ============================================================ */
  if (fine && !reduced) {
    $$("[data-tilt]").forEach(function (el) {
      var max = parseFloat(el.getAttribute("data-tilt")) || 7;
      var pending = null;
      var px = 0.5,
        py = 0.5;

      function apply() {
        pending = null;
        el.style.transform =
          "perspective(1100px) rotateX(" +
          ((0.5 - py) * max).toFixed(2) +
          "deg) rotateY(" +
          ((px - 0.5) * max).toFixed(2) +
          "deg) translateZ(6px)";
      }

      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width;
        py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--cx", (px * 100).toFixed(1) + "%");
        el.style.setProperty("--cy", (py * 100).toFixed(1) + "%");
        if (pending === null) pending = raf(apply);
      });

      el.addEventListener("pointerleave", function () {
        if (pending !== null) cancelAnimationFrame(pending);
        pending = null;
        el.style.transform = "";
      });
    });
  }

  /* ============================================================
     8. Marquee — clone the track so the loop is seamless
     ============================================================ */
  $$(".marquee").forEach(function (m) {
    var track = $(".marquee-track", m);
    if (!track || m.dataset.cloned) return;
    m.dataset.cloned = "1";
    var clone = track.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    m.appendChild(clone);
  });

  /* ============================================================
     9. Nav — stuck state, drawer, section spy
     ============================================================ */
  (function nav() {
    var bar = $(".site-nav");
    var links = $(".nav-links");
    var toggle = $(".nav-toggle");
    if (!bar) return;

    var lastY = 0;
    var ticking = false;
    function onScroll() {
      ticking = false;
      var y = window.scrollY;
      bar.classList.toggle("stuck", y > 10);
      // hide on the way down, bring it straight back on the way up
      bar.classList.toggle("hidden", y > 400 && y > lastY + 4 && !links.classList.contains("open"));
      lastY = y;
    }
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        raf(onScroll);
      },
      { passive: true }
    );
    onScroll();

    if (toggle && links) {
      toggle.addEventListener("click", function () {
        var open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
        root.classList.toggle("nav-open", open);
      });
      links.addEventListener("click", function (e) {
        if (!e.target.closest("a")) return;
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        root.classList.remove("nav-open");
      });
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !links.classList.contains("open")) return;
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        root.classList.remove("nav-open");
        toggle.focus();
      });
    }

    // section spy
    var spies = $$('.nav-links a[href^="#"]');
    if (spies.length && "IntersectionObserver" in window) {
      var map = {};
      spies.forEach(function (a) {
        var t = document.getElementById(a.getAttribute("href").slice(1));
        if (t) map[t.id] = a;
      });
      var sio = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            spies.forEach(function (a) {
              a.classList.remove("current");
            });
            if (map[en.target.id]) map[en.target.id].classList.add("current");
          });
        },
        { rootMargin: "-45% 0px -50% 0px" }
      );
      Object.keys(map).forEach(function (id) {
        sio.observe(document.getElementById(id));
      });
    }
  })();

  /* ============================================================
     10. Page transitions — same-origin links fade the curtain in
     ============================================================ */
  (function transitions() {
    var curtain = $(".curtain");
    if (!curtain || reduced) return;

    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (!a) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.origin !== location.origin) return;
      if (a.pathname === location.pathname) return;

      e.preventDefault();
      curtain.classList.add("on");
      setTimeout(function () {
        location.href = a.href;
      }, 380);
    });

    // returning via the back button must not leave the curtain down
    window.addEventListener("pageshow", function () {
      curtain.classList.remove("on");
    });
  })();

  /* ============================================================
     11. Copy buttons
     ============================================================ */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-copy]");
    if (!btn) return;
    var text = btn.getAttribute("data-copy");
    var label = btn.textContent;
    var ok = function () {
      btn.textContent = "copied";
      btn.classList.add("done");
      setTimeout(function () {
        btn.textContent = label;
        btn.classList.remove("done");
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        ok();
      } catch (err) {
        /* clipboard blocked — the value stays on screen to select by hand */
      }
      ta.remove();
    }
  });

  /* ============================================================
     12. Figure layer
     ============================================================
     A silhouette that sits between the aura and the copy. It is only
     mounted if the image actually loads, so a page with no artwork in
     place never shows a broken image or an empty box. Drop a PNG with
     a transparent background at assets/img/figure.png and it appears.

     Artwork you own or are licensed to use — see the README. */
  /* ============================================================
     11b. Full-bleed art layer
     ============================================================
     Reads data/art.json. Ships with an empty slide list, so a site with
     no artwork mounts nothing and requests nothing — the aura carries
     the hero on its own. Every slide is preloaded and only the ones
     that actually decode are used, so a typo in the manifest costs you
     that slide, not the layer. */
  (function art() {
    if (location.protocol === "file:") return; // fetch() of a local file is blocked

    // data/art.json is the source of truth. If it lists nothing, ask the dev
    // server to list the folder instead — that way dropping files into
    // assets/img/art/ is the ONLY step, with no JSON to edit while working
    // locally. Static hosts cannot list a directory, so `node web/scan-art.mjs`
    // bakes the same listing into art.json before deploying.
    fetch("data/art.json", { cache: "no-cache" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cfg) {
        cfg = cfg || {};
        if (cfg.slides && cfg.slides.length) {
          mount(cfg);
          return;
        }
        return fetch("/api/art", { cache: "no-cache" })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (live) {
            if (!live || !live.slides || !live.slides.length) return;
            live.interval = cfg.interval;
            live.fade = cfg.fade;
            live.dim = cfg.dim;
            mount(live);
          })
          .catch(function () {
            /* not the dev server — art.json is authoritative, and it is empty */
          });
      })
      .catch(function () {
        /* no manifest — nothing to show, and nothing to report */
      });

    function mount(cfg) {
      var fade = Number(cfg.fade) || 1800;
      var interval = Math.max(fade + 800, Number(cfg.interval) || 7000);
      var dim = cfg.dim == null ? 0.55 : Number(cfg.dim);

      var layer = document.createElement("div");
      layer.className = "art-layer";
      layer.setAttribute("aria-hidden", "true");
      layer.style.setProperty("--art-fade", fade + "ms");
      layer.style.setProperty("--art-dim", String(dim));

      // Indexed, not appended: pushing as each image finishes loading orders
      // the slides by decode speed rather than by the manifest.
      var byIndex = new Array(cfg.slides.length);
      var pending = cfg.slides.length;

      cfg.slides.forEach(function (slide, i) {
        var src = typeof slide === "string" ? slide : slide && slide.src;
        if (!src) {
          if (--pending === 0) finish();
          return;
        }

        var probe = new Image();
        probe.onload = function () {
          var el = document.createElement("div");
          el.className = "art-slide";
          el.style.backgroundImage = 'url("' + src + '")';
          el.style.backgroundPosition = (slide && slide.focus) || "center";
          el.style.animationDelay = -(i * 3) + "s"; // desynchronise the pushes
          byIndex[i] = el;
          if (--pending === 0) finish();
        };
        probe.onerror = function () {
          if (--pending === 0) finish();
        };
        probe.src = src;
      });

      function finish() {
        var loaded = byIndex.filter(Boolean);
        if (!loaded.length) return;

        loaded.forEach(function (el) {
          layer.appendChild(el);
        });
        document.body.insertBefore(layer, document.body.firstChild);
        root.classList.add("has-art");

        var idx = 0;
        loaded[0].classList.add("on");

        if (loaded.length > 1 && !reduced) {
          setInterval(function () {
            if (document.hidden) return;
            loaded[idx].classList.remove("on");
            idx = (idx + 1) % loaded.length;
            loaded[idx].classList.add("on");
          }, interval);
        }

        if (reduced || !fine) return;

        // Parallax. The art moves less than the aura in front of it, which is
        // the whole trick — matched speeds read as one flat picture.
        var tx = 0, ty = 0, cx = 0, cy = 0, raf1 = null;
        function step() {
          raf1 = null;
          cx += (tx - cx) * 0.05;
          cy += (ty - cy) * 0.05;
          layer.style.setProperty("--ax", cx.toFixed(2) + "px");
          layer.style.setProperty("--ay", cy.toFixed(2) + "px");
          if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) raf1 = raf(step);
        }
        window.addEventListener(
          "pointermove",
          function (e) {
            tx = (e.clientX / window.innerWidth - 0.5) * -26;
            ty = (e.clientY / window.innerHeight - 0.5) * -16;
            if (raf1 === null) raf1 = raf(step);
          },
          { passive: true }
        );

        // Past the hero the artwork must recede, or every section below it
        // becomes unreadable.
        var ticking = false;
        window.addEventListener(
          "scroll",
          function () {
            if (ticking) return;
            ticking = true;
            raf(function () {
              ticking = false;
              var p = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
              layer.style.opacity = String(1 - p * 0.72);
              layer.style.setProperty("--art-dim", String(Math.min(0.95, dim + p * 0.35)));
            });
          },
          { passive: true }
        );
      }
    }
  })();

  (function figure() {
    var host = document.querySelector("[data-figure]");
    if (!host) return;

    // Empty turns the slot off. A path enables it; the layer only mounts if
    // the image genuinely loads, so a typo degrades to "no layer" rather
    // than a broken image box.
    var src = (host.getAttribute("data-figure") || "").trim();
    if (!src) return;

    // Phones get the half-size export: shipping a 1200px asset to a 375px
    // screen is most of a megabyte for pixels nobody can resolve.
    if (!fine || window.innerWidth < 820) {
      src = src.replace(/(\.[a-z0-9]+)$/i, "@sm$1");
    }

    var img = new Image();
    img.decoding = "async";

    img.onerror = function () {
      /* no artwork in place yet — the aura carries the hero on its own */
    };

    img.onload = function () {
      var layer = document.createElement("div");
      layer.className = "figure-layer";
      layer.setAttribute("aria-hidden", "true");
      img.alt = "";

      // The holder is exactly the image box, which lets the scan overlay be
      // masked by the artwork's own alpha — so the sweep runs across the
      // figure itself and never across the empty space around it.
      var holder = document.createElement("div");
      holder.className = "figure-holder";
      holder.appendChild(img);

      var scan = document.createElement("span");
      scan.className = "figure-scan";
      // Absolute URL on purpose: a relative url() inside a custom property is
      // resolved against the stylesheet that consumes it, not the document, so
      // a relative path here 404s as /assets/css/assets/img/...
      scan.style.setProperty("--fig", 'url("' + new URL(src, location.href).href + '")');
      holder.appendChild(scan);

      layer.appendChild(holder);
      host.appendChild(layer);

      // energy that passes in front of the figure, not only behind it
      var haze = document.createElement("div");
      haze.className = "figure-haze";
      haze.setAttribute("aria-hidden", "true");
      host.appendChild(haze);

      root.classList.add("has-figure");

      if (reduced || !fine) return;

      // Parallax + perspective tilt. The figure moves LESS than the smoke
      // behind it, which is what actually reads as depth; the tilt is what
      // stops a flat PNG looking like a sticker.
      var tx = 0, ty = 0, cx = 0, cy = 0, pending = null;

      function apply() {
        pending = null;
        cx += (tx - cx) * 0.07;
        cy += (ty - cy) * 0.07;
        var st = holder.style;
        st.setProperty("--fx", cx.toFixed(2) + "px");
        st.setProperty("--fy", cy.toFixed(2) + "px");
        st.setProperty("--rx", (cx * -0.14).toFixed(2) + "deg");
        st.setProperty("--ry", (cy * 0.18).toFixed(2) + "deg");
        if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) pending = raf(apply);
      }

      window.addEventListener(
        "pointermove",
        function (e) {
          tx = (e.clientX / window.innerWidth - 0.5) * -38;
          ty = (e.clientY / window.innerHeight - 0.5) * -20;
          if (pending === null) pending = raf(apply);
        },
        { passive: true }
      );

      // Gone by the time the next section is on screen. Measured against that
      // section rather than a fixed scroll distance, so it stays correct
      // whatever the hero's height turns out to be on a given device.
      //
      // The page names the anchor with data-figure-until, because "the section
      // after the hero" is a marquee on one page and real content on another.
      // Falling back to the first following <section> keeps it working if the
      // attribute is missing.
      var next = null;
      var until = host.getAttribute("data-figure-until");
      if (until) next = document.querySelector(until);
      if (!next) {
        var sib = host.nextElementSibling;
        while (sib && sib.tagName !== "SECTION") sib = sib.nextElementSibling;
        next = sib;
      }
      var ticking = false;

      // The artwork never leaves — it eases from full strength in the hero down
      // to a faint constant presence that carries the rest of the page. FLOOR
      // is what it settles at; it has to stay low enough that body copy sitting
      // over it is still comfortable to read.
      var FLOOR = 0.20;

      function fade() {
        ticking = false;
        var vh = window.innerHeight;
        var t;

        if (next) {
          // 1 while the anchor section is still below the fold, reaching 0 a
          // little over a viewport after it arrives — so the hand-off lands
          // across the intro rather than snapping at its top edge.
          var top = next.getBoundingClientRect().top;
          t = 1 - Math.min(1, Math.max(0, (vh - top) / (vh * 1.45)));
        } else {
          t = Math.max(0, 1 - window.scrollY / Math.max(1, vh * 1.2));
        }
        t = t * t * (3 - 2 * t);

        var o = FLOOR + t * (1 - FLOOR);
        // Defocus as it recedes. At the floor the artwork sits behind body copy
        // in every section, and a sharp picture there competes with the text
        // even at low opacity — a blurred one reads as atmosphere.
        holder.style.filter = t > 0.99 ? "" : "blur(" + ((1 - t) * 3.2).toFixed(2) + "px)";
        holder.style.setProperty("--fs", (0.92 + t * 0.08).toFixed(3));
        layer.style.opacity = o.toFixed(3);
        haze.style.opacity = (o * 0.55).toFixed(3);
      }

      window.addEventListener(
        "scroll",
        function () {
          if (ticking) return;
          ticking = true;
          raf(fade);
        },
        { passive: true }
      );
      window.addEventListener("resize", fade);
      // A background tab does not run rAF, so a scroll that happens while the
      // page is hidden (a restored scroll position, an anchor jump) leaves the
      // figure at whatever opacity it had. Re-sync the moment it comes back.
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) fade();
      });
      fade();
    };

    img.src = src;
  })();

  /* ============================================================
     13. Theme — bone <-> ink
     ============================================================
     The shader watches data-theme on <html> and re-reads its palette
     from the --gl-* custom properties, so one attribute flips the
     layout and the 3D together. */
  (function theme() {
    var KEY = "rxdsec.theme";
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }

    var mql = window.matchMedia("(prefers-color-scheme: dark)");

    function apply(mode, persist) {
      root.setAttribute("data-theme", mode);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", mode === "dark" ? "#0b0b0c" : "#e9e7e1");
      if (!persist) return;
      try { localStorage.setItem(KEY, mode); } catch (e) { /* ignore */ }
    }

    // Dark is the house style; the OS only pulls it toward light when the
    // visitor has actually asked their system for a light UI.
    apply(stored || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"), false);

    // follow the OS until the visitor states a preference of their own
    if (!stored && mql.addEventListener) {
      mql.addEventListener("change", function (e) {
        var again = null;
        try { again = localStorage.getItem(KEY); } catch (err) { /* ignore */ }
        if (!again) apply(e.matches ? "dark" : "light", false);
      });
    }

    $$("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
      });
    });
  })();

  /* ============================================================
     14. Year stamp + install prompt
     ============================================================ */
  $$("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // PWA: hold the prompt and offer it on the button rather than letting
  // the browser fire its own banner at a random moment.
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    $$("[data-install]").forEach(function (b) {
      b.hidden = false;
    });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-install]");
    if (!b || !deferred) return;
    deferred.prompt();
    deferred = null;
    b.hidden = true;
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* offline support is a bonus, never a requirement */
      });
    });
  }
})();
