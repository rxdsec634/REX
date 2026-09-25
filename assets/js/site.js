/* ==================================================================
   REX — site behaviour
   ------------------------------------------------------------------
   Nav, mobile drawer, reveals, counters, pointer spotlight, copy
   buttons, OS detection, the hero tool ticker, the permission-gate
   packet, and the live REX interface demo.

   Everything is progressive: without this file the page is complete
   and readable, just still.
   ================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, reduced ? 0 : ms); }); };

  /* ---------------- nav ---------------- */
  (function nav() {
    var bar = $(".nav");
    if (!bar) return;
    var onScroll = function () { bar.classList.toggle("stuck", scrollY > 12); };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    var toggle = $(".nav-toggle");
    var links = $(".nav-links");
    if (!toggle || !links) return;
    var set = function (open) {
      links.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      root.classList.toggle("nav-open", open);
    };
    toggle.addEventListener("click", function () { set(!links.classList.contains("open")); });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  })();

  /* ---------------- split headline letters ---------------- */
  $$("[data-split]").forEach(function (el) {
    if (reduced) return;
    var i = 0;
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          // letters are grouped per word, so a line can only break between words
          n.textContent.split(/(\s+)/).forEach(function (word) {
            if (!word) return;
            if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(" ")); return; }
            var w = document.createElement("span");
            w.className = "w";
            word.split("").forEach(function (ch) {
              var s = document.createElement("span");
              s.className = "ch";
              s.style.setProperty("--i", i++);
              s.textContent = ch;
              w.appendChild(s);
            });
            frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    el.classList.add("split");
  });

  /* ---------------- reveal + counters ---------------- */
  function count(el) {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    var to = parseFloat(el.getAttribute("data-count"));
    if (reduced) { el.textContent = String(to); return; }
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min((now - t0) / 1300, 1);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  var show = function (el) {
    el.classList.add("in");
    $$("[data-count]", el).forEach(count);
    if (el.hasAttribute("data-count")) count(el);
  };
  var targets = $$(".reveal, [data-split], [data-count]");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        show(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });
    targets.forEach(function (el) { io.observe(el); });
  } else targets.forEach(show);
  // never leave content invisible (throttled tab, print, old browser)
  setTimeout(function () { targets.forEach(function (el) { if (!el.classList.contains("in")) show(el); }); }, 3500);

  /* ---------------- pointer spotlight on cards ---------------- */
  if (matchMedia("(pointer: fine)").matches) {
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(".spot");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* ---------------- copy buttons ---------------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-copy]");
    if (!btn) return;
    var text = btn.getAttribute("data-copy");
    var label = btn.innerHTML;
    var ok = function () {
      btn.textContent = "Copied";
      btn.classList.add("done");
      setTimeout(function () { btn.innerHTML = label; btn.classList.remove("done"); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () {});
  });

  /* ---------------- year ---------------- */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------------- platform ----------------
     Android is checked before Linux (its UA contains "Linux"), and
     iPadOS reports itself as a Mac, so touch points break the tie. */
  var OS = (function () {
    var ua = navigator.userAgent || "";
    var p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "").toLowerCase();
    if (/android/i.test(ua)) return "android";
    if (/iphone|ipad|ipod/i.test(ua) || (p.indexOf("mac") > -1 && navigator.maxTouchPoints > 1)) return "ios";
    if (p.indexOf("win") > -1 || /windows/i.test(ua)) return "windows";
    if (p.indexOf("mac") > -1 || /mac os/i.test(ua)) return "macos";
    if (p.indexOf("linux") > -1 || /linux|x11/i.test(ua)) return "linux";
    return "windows";
  })();
  root.setAttribute("data-os", OS);
  window.REX_OS = OS;

  var OS_COPY = {
    windows: { label: "Download for Windows", note: "Windows 10/11 · x64 installer" },
    linux: { label: "Download for Linux", note: ".deb and tarball · x64" },
    macos: { label: "macOS — coming soon", note: "Get notified, or build from source" },
    android: { label: "REX is a desktop agent", note: "Open this page on your computer to install" },
    ios: { label: "REX is a desktop agent", note: "Open this page on your computer to install" },
  };
  $$("[data-os-cta]").forEach(function (a) {
    var c = OS_COPY[OS];
    var lbl = $("[data-os-label]", a);
    if (lbl) lbl.textContent = c.label;
    var note = document.querySelector("[data-os-note]");
    if (note) note.textContent = c.note;
  });
  $$(".os-card[data-os-card]").forEach(function (card) {
    var os = card.getAttribute("data-os-card");
    if (os === OS || ((OS === "android" || OS === "ios") && os === "mobile")) card.classList.add("me");
  });
  // phones: offer to send the link to the computer instead of a download
  $$("[data-share-link]").forEach(function (b) {
    if (OS !== "android" && OS !== "ios") { b.hidden = true; return; }
    b.hidden = false;
    b.addEventListener("click", function () {
      var url = location.origin + location.pathname.replace(/[^/]*$/, "") + "downloads.html";
      if (navigator.share) navigator.share({ title: "REX", text: "Install REX on my computer", url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url);
    });
  });

  /* ---------------- hero ticker, fed by the 3D core ---------------- */
  (function ticker() {
    var t = $("[data-ticker]");
    if (!t) return;
    var box = t.closest(".ticker");
    var verb = box && box.querySelector("[data-ticker-verb]");
    var WORDS = { call: "calling", gate: "waiting for approval ·", approved: "approved ·", done: "done ·" };
    addEventListener("rex:tool", function (e) {
      var d = e.detail;
      t.textContent = d.name;
      if (verb) verb.textContent = WORDS[d.phase] || "calling";
      if (box) box.setAttribute("data-phase", d.phase || "call");
    });
    var stage = $(".hero-stage");
    if (stage) stage.addEventListener("click", function () { dispatchEvent(new CustomEvent("rex:pulse")); });
  })();

  /* ---------------- permission gate: a call travels the ladder -------- */
  (function gate() {
    var stack = $(".stack");
    if (!stack || reduced) return;
    var layers = $$(".layer", stack);
    var packet = document.createElement("i");
    packet.className = "packet";
    stack.appendChild(packet);
    var running = false;
    var run = async function () {
      if (running) return;
      running = true;
      // the hard denylist is checked first, then the rules from narrowest to widest
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        packet.style.transition = "top .45s cubic-bezier(.16,1,.3,1), opacity .2s";
        packet.style.top = (L.offsetTop + L.offsetHeight / 2 - 4) + "px";
        packet.style.opacity = "1";
        L.classList.add("lit");
        await sleep(520);
        L.classList.remove("lit");
      }
      packet.style.opacity = "0";
      await sleep(900);
      running = false;
    };
    if ("IntersectionObserver" in window) {
      var timer = null;
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { run(); timer = setInterval(run, 4800); }
        else { clearInterval(timer); timer = null; }
      }, { threshold: 0.4 }).observe(stack);
    }
  })();

  /* ================================================================
     Live REX interface
     A scripted session you can drive: pick a task, watch the agent
     plan and call tools, and answer the approval card yourself.
     ================================================================ */
  (function demo() {
    var app = $("[data-app]");
    if (!app) return;
    var log = $(".app-log", app);
    var chips = $$(".chip", app);
    var title = $("[data-app-title]", app);
    var status = $("[data-app-status]", app);
    var det = {
      tools: $("[data-d-tools]", app),
      ctx: $("[data-d-ctx]", app),
      ctxTxt: $("[data-d-ctxtxt]", app),
      files: $("[data-d-files]", app),
      mode: $("[data-d-mode]", app),
    };
    var state = { tools: 0, ctx: 8, files: [] };
    var busy = false;
    var run = 0; // bumps on every new task so a stale script stops

    function paintDetail() {
      if (det.tools) det.tools.textContent = String(state.tools);
      if (det.ctx) det.ctx.style.width = Math.min(96, state.ctx) + "%";
      if (det.ctxTxt) det.ctxTxt.textContent = Math.round(state.ctx * 2) + "k / 200k";
      if (det.files) det.files.innerHTML = state.files.length
        ? state.files.map(function (f) { return "<div><i></i>" + esc(f) + "</div>"; }).join("")
        : '<div style="color:var(--text-3)">none yet</div>';
    }

    function add(html) {
      var wrap = document.createElement("div");
      wrap.innerHTML = html;
      var el = wrap.firstElementChild;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    async function type(el, text, id) {
      if (reduced) { el.innerHTML = text; return; }
      // stream word by word; markup (code spans) is kept whole
      var parts = text.match(/<[^>]+>[^<]*<\/[^>]+>|\S+\s*/g) || [text];
      el.innerHTML = "";
      for (var i = 0; i < parts.length; i++) {
        if (id !== run) return;
        el.innerHTML += parts[i];
        log.scrollTop = log.scrollHeight;
        await sleep(28 + Math.random() * 40);
      }
    }

    async function tool(step, id) {
      state.tools++;
      state.ctx += step.ctx || 3;
      paintDetail();
      if (status) status.textContent = "working · " + step.name;
      var el = add(
        '<div class="m-tool' + (step.risk ? " risk" : "") + '">' +
          '<div class="m-tool-h"><i class="st"></i><b>' + esc(step.name) + "</b><span>" + esc(step.arg || "") + "</span><em>…</em></div>" +
        "</div>"
      );
      await sleep(step.wait || 700);
      if (id !== run) return el;
      el.classList.add("done");
      $("em", el).textContent = step.time || "0.4s";
      if (step.out) {
        var b = document.createElement("div");
        b.className = "m-tool-b" + (step.diff ? " diff" : "");
        b.innerHTML = step.out;
        el.appendChild(b);
      }
      log.scrollTop = log.scrollHeight;
      return el;
    }

    function approval(el) {
      return new Promise(function (resolve) {
        var box = document.createElement("div");
        box.className = "m-appr";
        box.innerHTML =
          '<button class="yes" type="button">Approve</button>' +
          '<button type="button" data-no>Deny</button>' +
          "<em>waiting on you</em>";
        el.appendChild(box);
        el.classList.remove("done");
        $("em", el).textContent = "needs approval";
        if (status) status.textContent = "paused · approval required";
        log.scrollTop = log.scrollHeight;
        box.addEventListener("click", function (e) {
          var b = e.target.closest("button");
          if (!b) return;
          var yes = !b.hasAttribute("data-no");
          box.classList.add("resolved");
          $("em", box).textContent = yes ? "approved" : "denied";
          el.classList.add("done");
          $("em", el).textContent = yes ? "applied" : "denied";
          resolve(yes);
        });
      });
    }

    var SCRIPTS = {
      jwt: {
        title: "Harden JWT verification",
        prompt: "Audit how we verify JWTs and fix anything unsafe.",
        steps: [
          { t: "think", text: "Planning · locate token handling, then trace it" },
          { t: "tool", name: "grep", arg: "jwt.verify  src/", out: "src/auth/token.ts:41\nsrc/auth/refresh.ts:18", time: "0.1s" },
          { t: "tool", name: "read", arg: "src/auth/token.ts", out: "88 lines · express middleware", time: "0.1s", ctx: 6 },
          { t: "say", text: "<code>token.ts:41</code> calls <code>jwt.verify</code> without pinning an algorithm, so the library accepts whatever the token header claims. Pinning it is a one-line change." },
          { t: "edit", name: "edit", arg: "src/auth/token.ts", risk: true, diff: true,
            out: '<span class="del">- jwt.verify(token, secret)</span><span class="add">+ jwt.verify(token, secret, { algorithms: ["HS256"] })</span>',
            file: "token.ts" },
          { t: "tool", name: "shell", arg: "npm test -- auth", out: "✓ 31 passed · 0 failed", time: "4.2s", wait: 1100 },
          { t: "say", text: "Done. The algorithm is pinned and the auth suite passes. A checkpoint of the old file is in the detail pane if you want it back." },
        ],
      },
      rate: {
        title: "Rate-limit the login route",
        prompt: "Add rate limiting to POST /login — 5 attempts a minute per IP.",
        steps: [
          { t: "think", text: "Planning · find the route, check for an existing limiter" },
          { t: "tool", name: "codebase_search", arg: "login route handler", out: "src/routes/auth.ts:12  router.post('/login', …)", time: "0.3s" },
          { t: "tool", name: "read", arg: "package.json", out: "express-rate-limit not installed", time: "0.1s" },
          { t: "say", text: "No limiter yet. I'll add <code>express-rate-limit</code> scoped to this one route rather than globally, so the rest of the API is untouched." },
          { t: "edit", name: "edit", arg: "src/routes/auth.ts", risk: true, diff: true,
            out: '<span class="add">+ const loginLimit = rateLimit({ windowMs: 60_000, max: 5 })</span><span class="del">- router.post("/login", login)</span><span class="add">+ router.post("/login", loginLimit, login)</span>',
            file: "auth.ts" },
          { t: "tool", name: "shell", arg: "npm test -- routes", out: "✓ 44 passed · 0 failed", time: "5.0s", wait: 1100 },
          { t: "say", text: "Limiter added and tests pass. The sixth attempt inside a minute now gets a <code>429</code>." },
        ],
      },
      explain: {
        title: "Explain this repository",
        prompt: "I just cloned this. Explain how it's put together.",
        steps: [
          { t: "think", text: "Reading the layout before saying anything" },
          { t: "tool", name: "glob", arg: "**/package.json", out: "apps/desktop · packages/agent-core · packages/tools · packages/permission-gate", time: "0.1s" },
          { t: "tool", name: "read", arg: "REX.md", out: "project conventions loaded into memory", time: "0.1s", ctx: 5 },
          { t: "say", text: "It's a monorepo. <code>apps/desktop</code> is the Electron shell. The agent loop lives in <code>agent-core</code>, every tool is in <code>tools</code>, and <code>permission-gate</code> decides what's allowed to run. Reads like these never need approval — only writes and execution ask." },
        ],
      },
    };

    async function start(key) {
      var s = SCRIPTS[key];
      if (!s) return;
      var id = ++run;
      busy = true;
      chips.forEach(function (c) { c.disabled = true; });
      $$(".app-sess", app).forEach(function (el) { el.classList.toggle("on", el.getAttribute("data-run") === key); });
      log.innerHTML = "";
      state = { tools: 0, ctx: 8, files: [] };
      paintDetail();
      if (title) title.textContent = s.title;

      add('<div class="m-user">' + esc(s.prompt) + "</div>");
      await sleep(400);

      for (var i = 0; i < s.steps.length; i++) {
        if (id !== run) return;
        var st = s.steps[i];
        if (st.t === "think") {
          var th = add('<div class="m-think"><i></i>' + esc(st.text) + "</div>");
          await sleep(900);
          th.remove();
        } else if (st.t === "say") {
          var say = add('<div class="m-say"></div>');
          await type(say, st.text, id);
          await sleep(250);
        } else if (st.t === "tool") {
          await tool(st, id);
        } else if (st.t === "edit") {
          var el = await tool(st, id);
          if (id !== run) return;
          var yes = await approval(el);
          if (id !== run) return;
          if (!yes) {
            var no = add('<div class="m-say"></div>');
            await type(no, "Understood — nothing was written. Tell me what you'd rather do and I'll propose that instead.", id);
            break;
          }
          state.files.push(st.file);
          paintDetail();
        }
      }
      if (id !== run) return;
      if (status) status.textContent = "idle · ready";
      busy = false;
      chips.forEach(function (c) { c.disabled = false; });
    }

    app.addEventListener("click", function (e) {
      var b = e.target.closest("[data-run]");
      if (!b) return;
      // switching tasks mid-run is allowed from the session list
      if (busy && !b.classList.contains("app-sess")) return;
      start(b.getAttribute("data-run"));
    });

    // start the first session when the interface scrolls into view
    if ("IntersectionObserver" in window) {
      var o = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        o.disconnect();
        start("jwt");
      }, { threshold: 0.35 });
      o.observe(app);
    } else start("jwt");
    paintDetail();
  })();

  /* ---------------- service worker ---------------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
