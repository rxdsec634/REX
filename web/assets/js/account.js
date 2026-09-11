/* ==================================================================
   Account — sign in, register, and the admin console
   ------------------------------------------------------------------
   One page, four states, chosen from the URL:

     ?code=…      an OAuth provider just sent the browser back
     ?device=…    REX opened this page to complete a desktop sign-in
     #admin       the owner's console
     (nothing)    sign in / register, or the signed-in account view

   The admin console shares this endpoint deliberately. There is no
   /admin path to find, no second login form to fingerprint, and the
   console is simply what this page renders when someone holds an
   admin session.

   Tokens live in sessionStorage, not localStorage: they die with the
   tab instead of sitting on disk until someone clears site data.
   ================================================================== */
(function () {
  "use strict";

  var KEY = "rxdsec.session";
  var AKEY = "rxdsec.admin";

  /* The API lives wherever the site is served from, so a deploy to a real
     domain needs no edit here. Override with ?api= for testing against a
     server on another host. */
  var API = (function () {
    var q = new URLSearchParams(location.search).get("api");
    if (q && /^https?:\/\//.test(q)) return q.replace(/\/$/, "");
    return location.origin;
  })();

  /* ------------------------- tiny helpers ------------------------- */

  function store(key, v) {
    try {
      if (v === undefined) return JSON.parse(sessionStorage.getItem(key) || "null");
      if (v === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(v));
    } catch (e) {
      /* private mode: everything still works, it just will not persist */
    }
    return v;
  }

  var readSession = function () { return store(KEY); };
  var writeSession = function (v) { return store(KEY, v); };
  var readAdmin = function () { return store(AKEY); };
  var writeAdmin = function (v) { return store(AKEY, v); };

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function svg(n, s) {
    return '<svg class="icon" width="' + (s || 16) + '" height="' + (s || 16) + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  }

  function bytes(n) {
    if (!n && n !== 0) return "—";
    if (n < 1024) return n + " B";
    var u = ["KB", "MB", "GB"], i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < 2);
    return n.toFixed(n < 10 ? 1 : 0) + " " + u[i];
  }

  function num(n) {
    return (n || 0).toLocaleString();
  }

  function when(iso) {
    if (!iso) return "never";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    var secs = (Date.now() - d.getTime()) / 1000;
    if (secs < 60) return "just now";
    if (secs < 3600) return Math.floor(secs / 60) + "m ago";
    if (secs < 86400) return Math.floor(secs / 3600) + "h ago";
    if (secs < 86400 * 30) return Math.floor(secs / 86400) + "d ago";
    return d.toISOString().slice(0, 10);
  }

  /**
   * Every network call goes through here so that failures have exactly one
   * shape. `res.json()` on an HTML error page throws something unreadable;
   * this turns everything into an Error with a sentence in it.
   */
  async function call(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers);
    if (opts.body && !(opts.body instanceof Blob) && !(opts.body instanceof File)) {
      headers["content-type"] = "application/json";
      opts.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }
    if (opts.token) headers.authorization = "Bearer " + opts.token;

    var res;
    try {
      res = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
    } catch (e) {
      throw new Error("Cannot reach the server at " + API + ".");
    }
    if (res.status === 204) return {};

    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* not JSON — fall through to the status-code message */
    }
    if (!res.ok) {
      var err = new Error((data && data.error) || "Request failed (HTTP " + res.status + ").");
      err.status = res.status;
      throw err;
    }
    return data || {};
  }

  /* ---------------- nav label, runs on every page ---------------- */

  function paintNav() {
    var s = readSession();
    var a = readAdmin();

    var label = "Login";
    var where = "account.html";
    if (s && s.user) {
      label = s.user.login || s.user.name || "Account";
    } else if (a && a.token) {
      // Marked, because being signed in as the owner is a different thing from
      // being signed in as yourself, and the two should never look alike.
      label = (a.username || "Admin") + " · admin";
      where = "account.html#admin";
    }

    document.querySelectorAll("[data-auth-label]").forEach(function (el) {
      el.textContent = label;
    });
    document.querySelectorAll("[data-auth-cta]").forEach(function (el) {
      el.setAttribute("href", where);
    });
  }
  paintNav();

  var root = document.getElementById("account");
  if (!root) return; // this file is nav-only on the other pages

  var lede = document.querySelector("[data-account-lede]");
  var title = document.querySelector("[data-account-title]");

  function head(h1, sub) {
    if (title) title.textContent = h1;
    if (lede) lede.textContent = sub;
  }

  function render(html) {
    root.innerHTML = html;
    // The shell reveals content on scroll; injected nodes have already missed
    // that observer, so make them visible directly.
    root.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  function busy(msg) {
    render('<div class="slot"><b>' + esc(msg) + "</b>One moment.</div>");
  }

  function fail(t, d) {
    render(
      '<div class="slot"><b>' + esc(t) + "</b>" + esc(d || "") +
      '<div class="hero-actions" style="justify-content:center;margin-top:20px">' +
      '<a class="btn" href="index.html"><span>Back to the site</span></a></div></div>'
    );
  }

  function note(kind, icon, html) {
    return '<div class="note note-' + kind + '">' + svg(icon, 15) + "<div>" + html + "</div></div>";
  }

  /** Swap a button into a working state and back, so double-clicks cannot fire twice. */
  function working(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = "<span>" + esc(label || "Working…") + "</span>";
    } else if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
    }
  }

  /* ================================================================
     PKCE
     ================================================================ */

  function b64url(buf) {
    var s = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
    return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function pkce() {
    var verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    var challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    return { verifier: verifier, challenge: challenge };
  }

  /* ================================================================
     Sign in / register
     ================================================================ */

  var mode = "login"; // or "register"

  function authCard(providers, opts) {
    opts = opts || {};
    var isReg = mode === "register";
    var oauth = providers.map(function (p) {
      return (
        '<button class="btn" data-provider="' + esc(p.id) + '" type="button">' +
        svg(p.id === "google" ? "globe" : "github", 15) +
        "<span>Continue with " + esc(p.label) + "</span></button>"
      );
    }).join("");

    return (
      '<form class="panel" id="authform" novalidate>' +
        '<span class="panel-n">' + (isReg ? "Create an account" : "Sign in") + "</span>" +
        '<div id="authmsg"></div>' +

        (oauth
          ? '<div class="hero-actions" style="flex-direction:column;align-items:stretch;margin-bottom:22px">' + oauth + "</div>" +
            '<div style="display:flex;align-items:center;gap:14px;margin-bottom:22px">' +
              '<i style="flex:1;height:1px;background:var(--rule)"></i>' +
              '<span class="label" style="color:var(--ink-3)">or with email</span>' +
              '<i style="flex:1;height:1px;background:var(--rule)"></i>' +
            "</div>"
          : '<p class="field-hint" style="margin:-6px 0 20px">' +
            "GitHub and Google sign-in are not enabled on this server yet. " +
            "Email and password works exactly the same way." +
            "</p>") +

        (isReg
          ? '<label class="field"><span>Name <i style="color:var(--ink-3);font-style:normal">optional</i></span>' +
            '<input class="input" name="name" autocomplete="name" maxlength="80"></label>'
          : "") +

        '<label class="field"><span>Email</span>' +
        '<input class="input" name="email" type="email" required autocomplete="email" ' +
        'autocapitalize="off" spellcheck="false" inputmode="email"></label>' +

        '<label class="field"><span>Password</span>' +
        '<input class="input" name="password" type="password" required ' +
        'autocomplete="' + (isReg ? "new-password" : "current-password") + '"></label>' +
        (isReg ? '<p class="field-hint">At least 10 characters. Longer beats complicated.</p>' : "") +

        '<div class="form-actions">' +
          '<button class="btn btn-primary" type="submit">' + svg("key", 14) +
          "<span>" + (isReg ? "Create account" : "Sign in") + "</span></button>" +
          '<span class="spacer"></span>' +
          '<button class="btn btn-sm" type="button" id="swapmode">' +
          "<span>" + (isReg ? "I already have an account" : "Create an account") + "</span></button>" +
        "</div>" +
        (opts.footer || "") +
      "</form>"
    );
  }

  function wireAuth(onSubmit, onProvider) {
    var form = document.getElementById("authform");
    var msg = document.getElementById("authmsg");

    function say(kind, icon, html) {
      msg.innerHTML = note(kind, icon, html);
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var data = {
        email: form.email.value.trim(),
        password: form.password.value,
        name: form.name ? form.name.value.trim() : "",
      };
      if (!data.email || !data.password) {
        return say("bad", "alert", "Enter your email and password.");
      }
      msg.innerHTML = "";
      working(btn, true, mode === "register" ? "Creating…" : "Signing in…");
      try {
        await onSubmit(data);
      } catch (err) {
        working(btn, false);
        say("bad", "alert", esc(err.message));
      }
    });

    document.getElementById("swapmode").addEventListener("click", function () {
      mode = mode === "login" ? "register" : "login";
      rerender();
    });

    root.querySelectorAll("[data-provider]").forEach(function (b) {
      b.addEventListener("click", function () { onProvider(b.getAttribute("data-provider")); });
    });
  }

  var rerender = function () {}; // replaced by whichever view is current

  /* ---------------------- browser sign-in ---------------------- */

  async function showAuth(conf) {
    head(
      mode === "register" ? "Create an account." : "Sign in.",
      mode === "register"
        ? "One account for the site and the agent. Every new account starts on a 14-day trial — no card."
        : "The same account works here and inside REX."
    );

    rerender = function () { showAuth(conf); };

    render(
      '<div class="grid grid-2">' +
        authCard(conf.providers || [], {
          footer:
            conf.allowSignup === false && mode === "register"
              ? note("warn", "info", "Registration is closed on this server at the moment.")
              : "",
        }) +
        '<div class="panel">' +
          '<span class="panel-n">What the account is for</span>' +
          '<h3 class="h3">REX will not run without one</h3>' +
          "<p>Signing in is what tells the agent it is entitled to run, which permissions it has, " +
          "and where to fetch updates from. Do it once; the agent keeps the session.</p>" +
          '<div class="kv" style="margin-top:20px"><code>14 days free</code></div>' +
          '<p class="small" style="margin-top:10px">Every account starts on a full-feature trial. ' +
          'No card, and nothing charges itself at the end — it simply stops. ' +
          '<a href="pricing.html" style="color:var(--blue)">See the plans</a>.</p>' +
          '<p class="small" style="margin-top:16px">We store your email, display name, and — for ' +
          "GitHub or Google — the id and avatar they give us. The agent counts the tokens it spends " +
          "against your account. Nothing else leaves your machine: no prompts, no file names, no code.</p>" +
        "</div>" +
      "</div>"
    );

    wireAuth(
      async function (data) {
        var path = mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
        var out = await call(path, { method: "POST", body: data });
        writeSession(out);
        paintNav();
        showAccount(out);
      },
      async function (provider) {
        busy("Redirecting to " + provider + "…");
        var k = await pkce();
        try { sessionStorage.setItem("rxdsec.pkce", k.verifier); } catch (e) { /* ignore */ }
        var u = new URL(API + "/api/v1/auth/start-web");
        u.searchParams.set("provider", provider);
        u.searchParams.set("code_challenge", k.challenge);
        u.searchParams.set("redirect_uri", location.origin + location.pathname);
        location.href = u.toString();
      }
    );
  }

  async function completeLogin(code) {
    busy("Completing sign-in…");
    var verifier = null;
    try {
      verifier = sessionStorage.getItem("rxdsec.pkce");
      sessionStorage.removeItem("rxdsec.pkce");
    } catch (e) { /* ignore */ }

    try {
      var out = await call("/api/v1/auth/token", {
        method: "POST",
        body: { code: code, code_verifier: verifier },
      });
      writeSession(out);
      paintNav();
      history.replaceState({}, "", location.pathname);
      showAccount(out);
    } catch (err) {
      fail("Sign-in failed", err.message);
    }
  }

  /* ================================================================
     Desktop sign-in — REX opened this page with ?device=<state>
     ================================================================ */

  async function showDevice(state, conf) {
    head("Sign in to REX.", "Finish here and the agent picks it up automatically.");
    rerender = function () { showDevice(state, conf); };

    render(
      '<div class="grid grid-2">' +
        authCard(conf.providers || []) +
        '<div class="panel">' +
          '<span class="panel-n">Signing in to the agent</span>' +
          '<h3 class="h3">REX is waiting for this</h3>' +
          "<p>The agent opened this page and is listening on your own machine for the result. " +
          "Nothing is sent anywhere else — the browser hands the session straight back to it.</p>" +
          '<p class="small" style="margin-top:16px">If you close this tab, nothing breaks. ' +
          "Start the sign-in again from REX whenever you like.</p>" +
        "</div>" +
      "</div>"
    );

    // In device mode the OAuth buttons re-use the pending request REX created,
    // so the loopback redirect and the PKCE challenge stay bound to it.
    wireAuth(
      async function (data) {
        var out = await call("/api/v1/auth/device", {
          method: "POST",
          body: {
            state: state,
            mode: mode,
            email: data.email,
            password: data.password,
            name: data.name,
          },
        });
        render(
          '<div class="slot"><b>Signed in as ' + esc(out.user.name || out.user.email) + "</b>" +
          "Handing the session to REX…</div>"
        );
        location.href = out.redirect;
      },
      function (provider) {
        location.href =
          API + "/api/v1/auth/device-oauth?state=" + encodeURIComponent(state) +
          "&provider=" + encodeURIComponent(provider);
      }
    );
  }

  /* ================================================================
     Live entitlement

     The agent re-checks with the server; until now this page did not, so an
     account suspended while someone had it open went on showing "active"
     until they reloaded. Two states disagreeing about the same account is
     worse than either being briefly stale.

     Polling only while the tab is visible: a background tab does not need to
     know, and every open tab hitting the server on a timer is a cost paid for
     nothing.
  ================================================================ */

  var livePoll = null;
  var liveAbort = null;
  var liveRetry = null;

  function stopLive() {
    if (livePoll) clearInterval(livePoll);
    livePoll = null;
    if (liveRetry) clearTimeout(liveRetry);
    liveRetry = null;
    if (liveAbort) liveAbort.abort();
    liveAbort = null;
  }

  /**
   * Hold the server's event stream open so a change lands here at once.
   *
   * fetch + a stream reader rather than EventSource, because EventSource
   * cannot send an Authorization header — the alternative is putting the
   * session token in a query string, where it would end up in proxy logs and
   * browser history. A header costs a few more lines and keeps the token out
   * of the URL.
   */
  function startStream(session, onChange) {
    if (!window.ReadableStream || !window.AbortController) return; // poll only
    if (liveAbort) liveAbort.abort();
    var ac = new AbortController();
    liveAbort = ac;

    var again = function (ms) {
      if (ac.signal.aborted) return;
      if (liveRetry) clearTimeout(liveRetry);
      liveRetry = setTimeout(function () { startStream(session, onChange); }, ms);
    };

    fetch(API + "/api/v1/auth/events", {
      headers: { authorization: "Bearer " + session.accessToken, accept: "text/event-stream" },
      signal: ac.signal,
    }).then(function (res) {
      if (res.status === 401) { stopLive(); writeSession(null); paintNav(); return start(); }
      if (!res.ok || !res.body) return again(30000);

      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "";

      var pump = function () {
        return reader.read().then(function (r) {
          if (r.done) return again(3000);
          buf += dec.decode(r.value, { stream: true });
          var i;
          // Frames end at a blank line; a payload can span several chunks.
          while ((i = buf.indexOf("\n\n")) >= 0) {
            var frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (!/^event: entitlement$/m.test(frame)) continue;
            var m = /^data: (.+)$/m.exec(frame);
            if (!m) continue;
            try {
              var ent = JSON.parse(m[1]);
              session.entitlement = ent;
              writeSession(session);
              paintNav();
              onChange(session);
            } catch (e) { /* malformed — the poll corrects it */ }
          }
          return pump();
        });
      };
      return pump();
    }).catch(function () { again(15000); });
  }

  function startLive(session, onChange) {
    stopLive();

    var signature = function (e) {
      return [e.allowed, e.offensive, e.plan, e.reason, e.daysLeft].join("|");
    };
    var last = signature(session.entitlement || {});

    var check = async function () {
      if (document.hidden) return;
      try {
        var fresh = await call("/api/v1/auth/me", { token: session.accessToken });
        if (signature(fresh.entitlement || {}) === last) return;
        last = signature(fresh.entitlement || {});
        session.user = fresh.user;
        session.entitlement = fresh.entitlement;
        session.devices = fresh.devices || [];
        writeSession(session);
        paintNav();
        onChange(session);
      } catch (err) {
        // A revoked or deleted account answers 401. Anything else is a network
        // blip and must not sign anyone out.
        if (err.status === 401) {
          stopLive();
          writeSession(null);
          paintNav();
          start();
        }
      }
    };

    // Push for immediacy, poll as the backstop for a stream that quietly died.
    startStream(session, onChange);
    livePoll = setInterval(check, 30000);
    // Coming back to the tab is exactly when a stale answer is most likely.
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) check();
    });
  }

  /* ================================================================
     Signed-in account
     ================================================================ */

  function planPill(ent) {
    if (!ent) return '<span class="state mute"><i></i>unknown</span>';
    if (!ent.allowed) {
      var word = (ent.reason || "blocked").replace(/_/g, " ");
      return '<span class="state bad"><i></i>' + esc(word) + "</span>";
    }
    if (ent.reason === "trial") {
      var d = ent.daysLeft;
      return '<span class="state ' + (d <= 3 ? "warn" : "ok") + '"><i></i>trial · ' +
        (d === 1 ? "last day" : d + " days left") + "</span>";
    }
    return '<span class="state ok"><i></i>pro' + (ent.daysLeft ? " · " + ent.daysLeft + "d" : "") + "</span>";
  }

  function showAccount(session) {
    var u = session.user || {};
    var e = session.entitlement || {};
    var devices = session.devices || [];
    head("Your account.", "Session, plan and permissions — the same ones the agent enforces.");
    rerender = function () { showAccount(session); };

    var initial = esc((u.name || u.email || "?").trim().charAt(0).toUpperCase());

    var unverified = u.emailVerified === false;

    render(
      verifyBanner +
      (unverified
        ? note("warn", "mail",
            "<b>Confirm your email address.</b> We sent a link to <b>" + esc(u.email || "") + "</b>. " +
            "It works once and expires in 24 hours." +
            '<div class="form-actions" style="margin-top:12px">' +
            '<button class="btn btn-sm" id="resend" type="button"><span>Send it again</span></button>' +
            "</div><div id=\"resendmsg\"></div>")
        : "") +
      (e.reason === "trial_used"
        ? note("warn", "info",
            "<b>This machine has already used its free trial.</b> The trial is one per computer, " +
            "not one per account, so a second account on the same machine does not start a new one. " +
            'If that is wrong — a shared or reinstalled machine, say — <a href="index.html#contact" ' +
            'style="color:var(--blue)">get in touch</a> and it can be reset.')
        : "") +
      (e.allowed
        ? ""
        : note("bad", "alert", "<b>REX will not run.</b> " + esc(e.message || "This account is not entitled.") +
            (e.reason === "trial_expired" || e.reason === "subscription_expired"
              ? ' <a href="pricing.html" style="color:var(--blue)">See the plans</a>.'
              : ""))) +

      '<div class="grid grid-2">' +
        '<div class="panel">' +
          '<span class="panel-n">Signed in</span>' +
          '<div class="who" style="margin-bottom:20px">' +
            (u.avatar
              ? '<img src="' + esc(u.avatar) + '" alt="" width="48" height="48" style="width:48px;height:48px">'
              : '<div class="who-blank" style="width:48px;height:48px;font-size:19px">' + initial + "</div>") +
            '<div class="who-txt">' +
              "<b style=\"font-size:17px\">" + esc(u.name || u.login || "Account") + "</b>" +
              "<span>" + esc(u.email || u.id) + "</span>" +
            "</div>" +
          "</div>" +

          '<div class="drawer" style="background:none;border:0">' +
            '<div class="row"><span>Plan</span>' + planPill(e) + "</div>" +
            '<div class="row"><span>Offensive mode</span>' +
              (e.offensive
                ? '<span class="state ok"><i></i>granted</span>'
                : '<span class="state mute"><i></i>not granted</span>') + "</div>" +
            '<div class="row"><span>Sign-in method</span>' +
              '<span class="state mute"><i></i>' + esc(u.provider === "local" ? "email" : u.provider) + "</span></div>" +
            '<div class="row"><span>Email</span>' +
              (u.emailVerified === false
                ? '<span class="state warn"><i></i>unconfirmed</span>'
                : '<span class="state ok"><i></i>confirmed</span>') + "</div>" +
          "</div>" +

          '<div class="form-actions">' +
            '<a class="btn btn-acid" href="downloads.html">' + svg("download", 14) + "<span>Download REX</span></a>" +
            '<button class="btn" id="signout" type="button"><span>Sign out</span></button>' +
          "</div>" +
        "</div>" +

        '<form class="panel" id="pwform">' +
          '<span class="panel-n">' + (u.hasPassword ? "Change password" : "Add a password") + "</span>" +
          '<div id="pwmsg"></div>' +
          (u.hasPassword
            ? ""
            : "<p style=\"margin-bottom:18px\">You sign in with " + esc(u.provider) +
              ". Adding a password gives you a second way in — useful if you ever lose access to that account.</p>") +
          (u.hasPassword
            ? '<label class="field"><span>Current password</span>' +
              '<input class="input" name="currentPassword" type="password" autocomplete="current-password" required></label>'
            : "") +
          '<label class="field"><span>New password</span>' +
          '<input class="input" name="newPassword" type="password" autocomplete="new-password" required></label>' +
          '<p class="field-hint">At least 10 characters. Changing it signs out every other session.</p>' +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" type="submit"><span>' +
            (u.hasPassword ? "Change password" : "Set password") + "</span></button>" +
          "</div>" +
        "</form>" +
      "</div>" +

      '<div class="grid" style="grid-template-columns:1fr;margin-top:1px">' +
        '<div class="panel">' +
          '<span class="panel-n">Machines</span>' +
          "<p>REX identifies the computer it runs on so a free trial cannot be " +
          "collected repeatedly by making new accounts. It sends a one-way hash of " +
          "stable hardware details — never a MAC address, a hostname, or anything " +
          "that can be turned back into them, and never from this website.</p>" +
          (devices.length
            ? '<div class="filelist" style="margin-top:16px">' +
              devices.map(function (d) {
                return (
                  '<div class="filerow">' +
                    svg(/win/i.test(d.label) ? "windows" : /darwin|mac/i.test(d.label) ? "apple" : "linux", 16) +
                    '<div class="grow"><b>' + esc(d.label) + "</b>" +
                    "<span>" + esc(d.id) + "… · first seen " + when(d.firstSeenAt) + "</span></div>" +
                    (d.blocked
                      ? '<span class="state bad"><i></i>blocked</span>'
                      : d.trialAnchor
                        ? '<span class="state ok"><i></i>trial machine</span>'
                        : d.trialSpentByAnother
                          ? '<span class="state warn"><i></i>trial already used here</span>'
                          : '<span class="state mute"><i></i>linked</span>') +
                  "</div>"
                );
              }).join("") +
              "</div>"
            : '<p class="field-hint" style="margin-top:14px">None yet. A machine appears here the ' +
              "first time you run the agent on it.</p>") +
        "</div>" +
      "</div>" +

      ""
    );

    startLive(session, showAccount);

    var resend = document.getElementById("resend");
    if (resend) {
      resend.addEventListener("click", async function () {
        var box = document.getElementById("resendmsg");
        working(resend, true, "Sending…");
        try {
          var out = await call("/api/v1/auth/verify/resend", { method: "POST", token: session.accessToken });
          working(resend, false);
          box.innerHTML = note("good", "check",
            out.transport === "console"
              ? "This server has no mail relay configured, so the link was written to its log instead."
              : "Sent. Check your inbox, and your spam folder.");
        } catch (err) {
          working(resend, false);
          box.innerHTML = note("bad", "alert", esc(err.message));
        }
      });
    }

    document.getElementById("signout").addEventListener("click", function () {
      stopLive();
      var s = readSession();
      if (s && s.accessToken) {
        call("/api/v1/auth/revoke", { method: "POST", token: s.accessToken }).catch(function () {});
      }
      writeSession(null);
      paintNav();
      mode = "login";
      start();
    });

    var pw = document.getElementById("pwform");
    pw.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var box = document.getElementById("pwmsg");
      var btn = pw.querySelector('button[type="submit"]');
      box.innerHTML = "";
      working(btn, true, "Saving…");
      try {
        var out = await call("/api/v1/auth/password", {
          method: "POST",
          token: session.accessToken,
          body: {
            currentPassword: pw.currentPassword ? pw.currentPassword.value : undefined,
            newPassword: pw.newPassword.value,
          },
        });
        working(btn, false);
        pw.reset();
        box.innerHTML = note("good", "check",
          "Password saved." + (out.otherSessionsRevoked ? " " + out.otherSessionsRevoked + " other session(s) signed out." : ""));
        session.user.hasPassword = true;
      } catch (err) {
        working(btn, false);
        box.innerHTML = note("bad", "alert", esc(err.message));
      }
    });
  }

  /* ================================================================
     Admin console
     ================================================================ */

  var adminTab = "releases";

  async function admin(path, opts) {
    var a = readAdmin();
    opts = opts || {};
    opts.token = a && a.token;
    try {
      return await call(path, opts);
    } catch (err) {
      // A dead session should drop you at the login form, not at an error you
      // cannot act on.
      if (err.status === 401) {
        writeAdmin(null);
        paintNav();
        showAdminLogin("Your admin session expired. Sign in again.");
        throw err;
      }
      throw err;
    }
  }

  function showAdminLogin(msg) {
    head("Admin.", "Console for this server — releases, accounts, permissions.");
    rerender = function () { showAdminLogin(msg); };

    render(
      '<div class="grid grid-2">' +
        '<form class="panel" id="adminform">' +
          '<span class="panel-n">Owner sign-in</span>' +
          '<div id="adminmsg">' + (msg ? note("warn", "info", esc(msg)) : "") + "</div>" +
          '<label class="field"><span>Username</span>' +
          '<input class="input mono" name="username" required autocomplete="username" ' +
          'autocapitalize="off" spellcheck="false"></label>' +
          '<label class="field"><span>Password</span>' +
          '<input class="input" name="password" type="password" required autocomplete="current-password"></label>' +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" type="submit">' + svg("shield", 14) + "<span>Sign in</span></button>" +
            '<span class="spacer"></span>' +
            '<a class="btn btn-sm" href="#"><span>Back</span></a>' +
          "</div>" +
        "</form>" +
        '<div class="panel">' +
          '<span class="panel-n">Note</span>' +
          '<h3 class="h3">This is not a user account</h3>' +
          "<p>The console credential is separate from the sign-in above it. It is not in the user " +
          "list, it has no subscription, and it cannot be created by registering.</p>" +
          '<p class="small" style="margin-top:16px">On a fresh server it is bootstrapped from ' +
          "<code>ADMIN_BOOTSTRAP_USER</code> and <code>ADMIN_BOOTSTRAP_PASS</code>, and the console " +
          "refuses to do anything at all until that password has been changed.</p>" +
        "</div>" +
      "</div>"
    );

    var f = document.getElementById("adminform");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var box = document.getElementById("adminmsg");
      var btn = f.querySelector('button[type="submit"]');
      box.innerHTML = "";
      working(btn, true, "Checking…");
      try {
        var out = await call("/api/v1/admin/login", {
          method: "POST",
          body: { username: f.username.value.trim(), password: f.password.value },
        });
        writeAdmin(out);
        paintNav();
        if (out.mustChange) return showAdminCredentials(true);
        showAdminConsole();
      } catch (err) {
        working(btn, false);
        box.innerHTML = note("bad", "alert", esc(err.message));
      }
    });
  }

  /** The forced credential change. Nothing else in the console works until this is done. */
  function showAdminCredentials(forced) {
    var a = readAdmin() || {};
    head(forced ? "Change these credentials." : "Admin credentials.", forced
      ? "The console is locked until the bootstrap password is replaced."
      : "Change the console username or password.");
    rerender = function () { showAdminCredentials(forced); };

    render(
      (forced
        ? note("warn", "alert",
            "<b>This server is still on its bootstrap password.</b> It was set from an environment " +
            "variable, which means it exists in your shell history, your deploy config, and anywhere " +
            "else you pasted it. Every other part of the console is disabled until you replace it.")
        : "") +

      '<div class="grid grid-2">' +
        '<form class="panel" id="credform">' +
          '<span class="panel-n">New credentials</span>' +
          '<div id="credmsg"></div>' +
          '<label class="field"><span>Current password</span>' +
          '<input class="input" name="currentPassword" type="password" required autocomplete="current-password"></label>' +
          '<label class="field"><span>Username</span>' +
          '<input class="input mono" name="newUsername" value="' + esc(a.username || "") + '" ' +
          'required autocomplete="username" autocapitalize="off" spellcheck="false"></label>' +
          '<label class="field"><span>New password</span>' +
          '<input class="input" name="newPassword" type="password" required autocomplete="new-password"></label>' +
          '<label class="field"><span>Repeat new password</span>' +
          '<input class="input" name="confirm" type="password" required autocomplete="new-password"></label>' +
          '<p class="field-hint">At least 10 characters. Stored as a salted scrypt hash — ' +
          "if you lose it, delete <code>server/data/admin.json</code> and restart to bootstrap again.</p>" +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" type="submit"><span>Save credentials</span></button>' +
            (forced ? "" : '<span class="spacer"></span><button class="btn btn-sm" type="button" id="credback"><span>Back to console</span></button>') +
          "</div>" +
        "</form>" +
        '<div class="panel">' +
          '<span class="panel-n">What changes</span>' +
          "<p>Saving signs out every other console session, on every device, immediately. Your own " +
          "session is renewed in place so you are not bounced back to the login form.</p>" +
          '<p class="small" style="margin-top:16px">The <code>ADMIN_BOOTSTRAP_*</code> variables are ' +
          "read only when no admin record exists. After this they do nothing and can be deleted from " +
          "your <code>.env</code>.</p>" +
          '<p class="small" style="margin-top:16px">This credential is for the browser. ' +
          "<code>ADMIN_TOKEN</code>, used by <code>scripts/publish-release.mjs</code>, is separate and " +
          "is not affected.</p>" +
        "</div>" +
      "</div>"
    );

    if (!forced) {
      document.getElementById("credback").addEventListener("click", showAdminConsole);
    }

    var f = document.getElementById("credform");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var box = document.getElementById("credmsg");
      var btn = f.querySelector('button[type="submit"]');
      box.innerHTML = "";
      if (f.newPassword.value !== f.confirm.value) {
        return (box.innerHTML = note("bad", "alert", "The two new passwords do not match."));
      }
      working(btn, true, "Saving…");
      try {
        var out = await admin("/api/v1/admin/credentials", {
          method: "POST",
          body: {
            currentPassword: f.currentPassword.value,
            newUsername: f.newUsername.value.trim(),
            newPassword: f.newPassword.value,
          },
        });
        writeAdmin(out);
        paintNav();
        showAdminConsole();
      } catch (err) {
        working(btn, false);
        box.innerHTML = note("bad", "alert", esc(err.message));
      }
    });
  }

  /* --------------------------- shell --------------------------- */

  async function showAdminConsole() {
    var a = readAdmin();
    if (!a || !a.token) return showAdminLogin();
    if (a.mustChange) return showAdminCredentials(true);

    head("Admin.", "Releases, accounts and permissions for this server.");
    rerender = showAdminConsole;

    render(
      '<div class="tabs" id="admintabs">' +
        '<button class="tab" data-tab="releases">Releases</button>' +
        '<button class="tab" data-tab="users">Users</button>' +
        '<button class="tab" data-tab="devices">Devices</button>' +
        '<button class="tab" data-tab="activity">Activity</button>' +
        '<button class="tab" data-tab="settings">Settings</button>' +
        '<span style="flex:1"></span>' +
        '<button class="tab" data-tab="__out">Sign out</button>' +
      "</div>" +
      '<div id="adminbody"><div class="slot"><b>Loading…</b></div></div>'
    );

    document.querySelectorAll("#admintabs .tab").forEach(function (b) {
      b.classList.toggle("on", b.dataset.tab === adminTab);
      b.addEventListener("click", function () {
        if (b.dataset.tab === "__out") {
          writeAdmin(null);
          paintNav();
          location.hash = "";
          return start();
        }
        adminTab = b.dataset.tab;
        showAdminConsole();
      });
    });

    var body = document.getElementById("adminbody");
    try {
      if (adminTab === "releases") await tabReleases(body);
      else if (adminTab === "users") await tabUsers(body);
      else if (adminTab === "devices") await tabDevices(body);
      else if (adminTab === "activity") await tabActivity(body);
      else await tabSettings(body);
    } catch (err) {
      if (err.status !== 401) body.innerHTML = note("bad", "alert", esc(err.message));
    }
  }

  /* -------------------------- releases -------------------------- */

  async function tabReleases(body) {
    var data = await admin("/api/v1/admin/releases");
    var channels = data.channels || {};
    var artifacts = data.artifacts || [];

    var rows = [];
    Object.keys(channels).forEach(function (ch) {
      (channels[ch] || []).forEach(function (r) { rows.push(Object.assign({ channel: ch }, r)); });
    });
    rows.sort(function (x, y) { return String(y.releasedAt || "").localeCompare(String(x.releasedAt || "")); });

    body.innerHTML =
      '<div class="grid grid-2" style="margin-bottom:26px">' +
        '<div class="panel">' +
          '<span class="panel-n">Upload a build</span>' +
          '<div id="upmsg"></div>' +
          '<label class="drop" id="drop">' +
            '<input type="file" id="file" multiple>' +
            svg("upload", 22) +
            "<b>Drop installers here</b>" +
            "<p>Or click to choose. Accepted: <code>REX Setup &lt;v&gt;.exe</code>, " +
            "<code>REX &lt;v&gt;.exe</code>, <code>rex_&lt;v&gt;_amd64.deb</code>, " +
            "<code>rex-&lt;v&gt;-linux-x64.tar.gz</code>, <code>REX-&lt;v&gt;.dmg</code>.</p>" +
          "</label>" +
          '<div class="bar" id="upbar" hidden><i></i></div>' +
          '<p class="field-hint">Each file is hashed as it arrives, so the checksum published in the ' +
          "feed is computed from the bytes that actually landed here.</p>" +
        "</div>" +

        '<form class="panel" id="pubform">' +
          '<span class="panel-n">Publish</span>' +
          '<div id="pubmsg"></div>' +
          '<div class="field-row">' +
            '<label class="field"><span>Version</span>' +
            '<input class="input mono" name="version" placeholder="0.2.0" required></label>' +
            '<label class="field"><span>Channel</span>' +
            '<select class="select mono" name="channel"><option>stable</option><option>beta</option></select></label>' +
          "</div>" +
          '<label class="field"><span>Release notes</span>' +
          '<textarea class="textarea" name="notes" placeholder="What changed."></textarea></label>' +
          '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:6px">' +
            '<label class="toggle"><input type="checkbox" name="mandatory"><i class="track"></i>' +
            '<span class="lbl">Mandatory</span></label>' +
            '<label class="toggle"><input type="checkbox" name="draft"><i class="track"></i>' +
            '<span class="lbl">Draft</span></label>' +
          "</div>" +
          '<p class="field-hint">Mandatory tells REX not to offer "later". Draft keeps it out of the ' +
          "feed entirely, so you can stage a build before anyone sees it.</p>" +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" type="submit">' + svg("zap", 14) +
            "<span>Publish from files on disk</span></button>" +
          "</div>" +
        "</form>" +
      "</div>" +

      '<h4 class="h4" style="margin-bottom:14px">Files on disk' +
      ' <span class="dim mono" style="font-size:11px">' + artifacts.length + "</span></h4>" +
      (artifacts.length
        ? '<div class="filelist" style="margin-bottom:34px">' +
          artifacts.map(function (f) {
            return (
              '<div class="filerow">' +
                svg(f.platform === "win32" ? "windows" : f.platform === "darwin" ? "apple" : "linux", 17) +
                '<div class="grow"><b>' + esc(f.name) + "</b>" +
                "<span>" + bytes(f.size) + " · " + esc(f.kind) + " · " + when(f.mtime) + "</span></div>" +
                '<button class="btn btn-sm" data-rmfile="' + esc(f.name) + '" type="button">' +
                "<span>Delete</span></button>" +
              "</div>"
            );
          }).join("") +
          "</div>"
        : '<div class="slot" style="margin-bottom:34px"><b>Nothing uploaded yet</b>' +
          "Upload an installer above, or run <code>npm run package</code> and " +
          "<code>node scripts/publish-release.mjs</code> locally.</div>") +

      '<h4 class="h4" style="margin-bottom:14px">Published releases</h4>' +
      (rows.length
        ? '<div class="tablewrap"><table class="dtable"><thead><tr>' +
          "<th>Version</th><th>Channel</th><th>State</th><th>Assets</th><th>Released</th>" +
          '<th class="shrink"></th></tr></thead><tbody>' +
          rows.map(function (r) {
            return (
              "<tr>" +
                '<td class="mono"><b>' + esc(r.version) + "</b></td>" +
                '<td class="mono">' + esc(r.channel) + "</td>" +
                "<td>" +
                  (r.draft ? '<span class="state mute"><i></i>draft</span>' : '<span class="state ok"><i></i>live</span>') +
                  (r.mandatory ? ' <span class="state warn"><i></i>forced</span>' : "") +
                "</td>" +
                '<td class="mono">' + (r.assets || []).map(function (x) { return esc(x.platform); }).join(", ") + "</td>" +
                "<td>" + when(r.releasedAt) + "</td>" +
                '<td class="shrink" style="text-align:right;white-space:nowrap">' +
                  '<button class="btn btn-sm" data-editrel="' + esc(r.channel) + "|" + esc(r.version) + '" type="button">' +
                  "<span>Edit</span></button> " +
                  '<button class="btn btn-sm" data-delrel="' + esc(r.channel) + "|" + esc(r.version) + '" type="button">' +
                  "<span>Withdraw</span></button>" +
                "</td>" +
              "</tr>" +
              '<tr class="drawer" hidden data-drawer="' + esc(r.channel) + "|" + esc(r.version) + '"><td colspan="6">' +
                '<div class="drawer-in">' +
                  "<div><h5>Notes</h5>" +
                  '<textarea class="textarea" data-notes>' + esc(r.notes || "") + "</textarea></div>" +
                  "<div><h5>Flags</h5>" +
                    '<label class="toggle" style="margin-bottom:12px"><input type="checkbox" data-flag="mandatory"' +
                    (r.mandatory ? " checked" : "") + '><i class="track"></i><span class="lbl">Mandatory</span></label><br>' +
                    '<label class="toggle"><input type="checkbox" data-flag="draft"' +
                    (r.draft ? " checked" : "") + '><i class="track"></i><span class="lbl">Draft</span></label>' +
                    '<div class="form-actions"><button class="btn btn-sm btn-primary" data-saverel type="button">' +
                    "<span>Save</span></button></div>" +
                  "</div>" +
                  "<div><h5>Assets</h5>" +
                    (r.assets || []).map(function (x) {
                      return '<code style="display:block;font-size:10.5px;color:var(--ink-3);margin-bottom:6px;word-break:break-all">' +
                        esc(x.platform) + " · " + bytes(x.size) + "<br>" + esc((x.sha256 || "").slice(0, 32)) + "…</code>";
                    }).join("") +
                  "</div>" +
                "</div>" +
              "</td></tr>"
            );
          }).join("") +
          "</tbody></table></div>"
        : '<div class="slot"><b>Nothing published</b>Upload a build, then publish it above.</div>');

    wireReleases(body, artifacts);
  }

  function wireReleases(body, artifacts) {
    /* ---- upload ---- */
    var drop = document.getElementById("drop");
    var input = document.getElementById("file");
    var bar = document.getElementById("upbar");
    var upmsg = document.getElementById("upmsg");

    ["dragenter", "dragover"].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) upload(e.dataTransfer.files);
    });
    input.addEventListener("change", function () {
      if (input.files.length) upload(input.files);
    });

    async function upload(files) {
      var list = Array.prototype.slice.call(files);
      var a = readAdmin();
      bar.hidden = false;
      upmsg.innerHTML = "";
      var done = [];

      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        bar.querySelector("i").style.width = Math.round((i / list.length) * 100) + "%";
        upmsg.innerHTML = note("good", "upload", "Uploading <b>" + esc(f.name) + "</b> — " + bytes(f.size) + "…");
        try {
          // Streamed straight from the File object; the browser handles the
          // chunking and a 120 MB build never sits in a JS string.
          var res = await fetch(
            API + "/api/v1/admin/upload?name=" + encodeURIComponent(f.name),
            { method: "PUT", headers: { authorization: "Bearer " + a.token }, body: f }
          );
          var out = await res.json();
          if (!res.ok) throw new Error(out.error || "HTTP " + res.status);
          done.push(out);
        } catch (err) {
          bar.hidden = true;
          upmsg.innerHTML = note("bad", "alert", "<b>" + esc(f.name) + "</b><br>" + esc(err.message));
          return;
        }
      }

      bar.querySelector("i").style.width = "100%";
      setTimeout(function () { showAdminConsole(); }, 350);
    }

    /* ---- delete a file ---- */
    body.querySelectorAll("[data-rmfile]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var name = b.getAttribute("data-rmfile");
        if (!confirm("Delete " + name + " from the server?\n\nAnyone with a direct link will get a 404.")) return;
        working(b, true, "…");
        try {
          await admin("/api/v1/admin/artifacts?name=" + encodeURIComponent(name), { method: "DELETE" });
          showAdminConsole();
        } catch (err) {
          working(b, false);
          alert(err.message);
        }
      });
    });

    /* ---- publish ---- */
    var pub = document.getElementById("pubform");
    pub.addEventListener("submit", async function (e) {
      e.preventDefault();
      var box = document.getElementById("pubmsg");
      var btn = pub.querySelector('button[type="submit"]');
      var version = pub.version.value.trim();
      box.innerHTML = "";

      // Assets come from what is on disk, matched by version. Typing checksums
      // by hand is how a download page ends up disagreeing with the feed.
      var matched = artifacts.filter(function (f) { return f.name.indexOf(version) >= 0; });
      if (!matched.length) {
        return (box.innerHTML = note("bad", "alert",
          "No uploaded file has <code>" + esc(version) + "</code> in its name. Upload the build first."));
      }

      // One asset per platform for the feed: the installer, not the portable,
      // because that is what an in-place update should run.
      var prefer = { win32: "installer", linux: "deb", darwin: "dmg" };
      var assets = [];
      ["win32", "linux", "darwin"].forEach(function (plat) {
        var forPlat = matched.filter(function (f) { return f.platform === plat; });
        if (!forPlat.length) return;
        var pick = forPlat.filter(function (f) { return f.kind === prefer[plat]; })[0] || forPlat[0];
        assets.push({ platform: pick.platform, arch: pick.arch, url: pick.url, size: pick.size, sha256: pick.sha256 });
      });

      working(btn, true, "Publishing…");
      try {
        await admin("/api/v1/admin/releases", {
          method: "POST",
          body: {
            version: version,
            channel: pub.channel.value,
            notes: pub.notes.value,
            mandatory: pub.mandatory.checked,
            draft: pub.draft.checked,
            assets: assets,
          },
        });
        showAdminConsole();
      } catch (err) {
        working(btn, false);
        box.innerHTML = note("bad", "alert", esc(err.message));
      }
    });

    /* ---- edit / withdraw ---- */
    body.querySelectorAll("[data-editrel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = body.querySelector('[data-drawer="' + b.getAttribute("data-editrel") + '"]');
        if (row) row.hidden = !row.hidden;
      });
    });

    body.querySelectorAll("[data-saverel]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var row = b.closest("[data-drawer]");
        var parts = row.getAttribute("data-drawer").split("|");
        working(b, true, "Saving…");
        try {
          await admin("/api/v1/admin/releases", {
            method: "PATCH",
            body: {
              channel: parts[0],
              version: parts[1],
              notes: row.querySelector("[data-notes]").value,
              mandatory: row.querySelector('[data-flag="mandatory"]').checked,
              draft: row.querySelector('[data-flag="draft"]').checked,
            },
          });
          showAdminConsole();
        } catch (err) {
          working(b, false);
          alert(err.message);
        }
      });
    });

    body.querySelectorAll("[data-delrel]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var parts = b.getAttribute("data-delrel").split("|");
        if (!confirm("Withdraw " + parts[1] + " from the " + parts[0] + " feed?\n\nREX will stop offering it.")) return;
        var alsoFiles = confirm("Also delete its installer files from disk?\n\nOK deletes them. Cancel keeps them — the release just leaves the feed.");
        working(b, true, "…");
        try {
          await admin(
            "/api/v1/admin/releases?channel=" + encodeURIComponent(parts[0]) +
            "&version=" + encodeURIComponent(parts[1]) + (alsoFiles ? "&files=1" : ""),
            { method: "DELETE" }
          );
          showAdminConsole();
        } catch (err) {
          working(b, false);
          alert(err.message);
        }
      });
    });
  }

  /* ---------------------------- users --------------------------- */

  async function tabUsers(body) {
    var data = await admin("/api/v1/admin/users");
    var users = data.users || [];
    var t = data.totals || {};

    body.innerHTML =
      '<div class="stats">' +
        '<div class="stat"><b>' + num(t.users) + "</b><span>Accounts</span></div>" +
        '<div class="stat"><b>' + num(t.active) + "</b><span>Entitled</span></div>" +
        '<div class="stat"><b>' + num(t.offensive) + "</b><span>Offensive mode</span></div>" +
        '<div class="stat"><b>' + num(t.suspended) + "</b><span>Suspended</span></div>" +
        '<div class="stat"><b>' + num(t.requests) + "</b><span>Agent runs</span></div>" +
        '<div class="stat"><b>' + num((t.tokensIn || 0) + (t.tokensOut || 0)) + "</b><span>Tokens used</span></div>" +
      "</div>" +

      (users.length
        ? '<div class="tablewrap"><table class="dtable"><thead><tr>' +
          "<th>Account</th><th>Plan</th><th>Offensive</th><th>Machines</th>" +
          '<th class="num">Tokens</th><th class="num">Runs</th><th>Last seen</th>' +
          '<th class="shrink"></th></tr></thead><tbody>' +
          users.map(userRow).join("") +
          "</tbody></table></div>"
        : '<div class="slot"><b>No accounts yet</b>They appear here the moment someone signs in.</div>');

    wireUsers(body, users);
  }

  function userRow(u) {
    var e = u.entitlement || {};
    var used = (u.usage && u.usage.tokensIn + u.usage.tokensOut) || 0;
    var initial = esc((u.name || u.email || "?").trim().charAt(0).toUpperCase());

    return (
      '<tr data-user="' + esc(u.id) + '">' +
        "<td><div class=\"who\">" +
          (u.avatar
            ? '<img src="' + esc(u.avatar) + '" alt="">'
            : '<div class="who-blank">' + initial + "</div>") +
          '<div class="who-txt"><b>' + esc(u.name || u.login || "—") + "</b>" +
          "<span>" + esc(u.email || u.id) + "</span></div>" +
        "</div></td>" +
        "<td>" + planPill(e) + "</td>" +
        "<td>" + (u.offensive
          ? '<span class="state bad"><i></i>granted</span>'
          : '<span class="state mute"><i></i>off</span>') + "</td>" +
        "<td>" + ((u.devices || []).length
          ? '<span class="state ' + ((u.devices || []).some(function (d) { return d.blocked; }) ? "bad" : "mute") + '"><i></i>' +
            (u.devices || []).length + "</span>"
          : '<span class="state mute"><i></i>—</span>') + "</td>" +
        '<td class="num">' + num(used) + "</td>" +
        '<td class="num">' + num(u.usage && u.usage.requests) + "</td>" +
        "<td>" + when(u.lastSeenAt) + "</td>" +
        '<td class="shrink"><button class="btn btn-sm" data-edituser="' + esc(u.id) + '" type="button">' +
        "<span>Manage</span></button></td>" +
      "</tr>" +

      '<tr class="drawer" hidden data-udrawer="' + esc(u.id) + '"><td colspan="8"><div class="drawer-in">' +
        "<div><h5>Access</h5>" +
          '<label class="field"><span>State</span>' +
          '<select class="select mono" data-f="access">' +
            ["active", "pending", "suspended"].map(function (s) {
              return '<option value="' + s + '"' + (u.access === s ? " selected" : "") + ">" + s + "</option>";
            }).join("") +
          "</select></label>" +
          '<p class="field-hint">Suspending is pushed to the account at once — a running agent shows ' +
          "the suspension within about a second, without restarting. Every session is revoked so it " +
          "cannot renew, and signing in again does not undo it.</p>" +
        "</div>" +

        "<div><h5>Permissions</h5>" +
          '<label class="toggle" style="margin-bottom:14px">' +
          '<input type="checkbox" data-f="offensive"' + (u.offensive ? " checked" : "") + '>' +
          '<i class="track"></i><span class="lbl">Offensive mode</span></label>' +
          '<p class="field-hint">Off for every account until granted. This unlocks REX\'s ' +
          "exploitation and post-exploitation tooling — grant it to people you would put on an " +
          "engagement, not to everyone with a licence. Granting and revoking both reach a running " +
          "agent immediately.</p>" +
        "</div>" +

        "<div><h5>Plan</h5>" +
          '<label class="field"><span>Kind</span>' +
          '<select class="select mono" data-f="plan">' +
            ["trial", "pro", "none"].map(function (s) {
              return '<option value="' + s + '"' + ((u.plan && u.plan.kind) === s ? " selected" : "") + ">" + s + "</option>";
            }).join("") +
          "</select></label>" +
          '<label class="field"><span>Days <i style="color:var(--ink-3);font-style:normal">blank = no expiry</i></span>' +
          '<input class="input mono" data-f="days" type="number" min="1" max="365" placeholder="14"></label>' +
        "</div>" +

        "<div><h5>Notes</h5>" +
          '<textarea class="textarea" data-f="notes" placeholder="Why this account is set up the way it is.">' +
          esc(u.notes || "") + "</textarea>" +
          '<div class="form-actions">' +
            '<button class="btn btn-sm btn-primary" data-saveuser type="button"><span>Save</span></button>' +
            '<span class="spacer"></span>' +
            '<button class="btn btn-sm" data-deluser type="button"><span>Delete</span></button>' +
          "</div>" +
        "</div>" +
      "</div></td></tr>"
    );
  }

  function wireUsers(body, users) {
    body.querySelectorAll("[data-edituser]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = body.querySelector('[data-udrawer="' + b.getAttribute("data-edituser") + '"]');
        if (row) row.hidden = !row.hidden;
      });
    });

    body.querySelectorAll("[data-saveuser]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var row = b.closest("[data-udrawer]");
        var id = row.getAttribute("data-udrawer");
        var get = function (f) { return row.querySelector('[data-f="' + f + '"]'); };
        var days = get("days").value.trim();

        working(b, true, "Saving…");
        try {
          await admin("/api/v1/admin/users", {
            method: "PATCH",
            body: {
              id: id,
              access: get("access").value,
              offensive: get("offensive").checked,
              plan: get("plan").value,
              days: days === "" ? undefined : Number(days),
              notes: get("notes").value,
            },
          });
          showAdminConsole();
        } catch (err) {
          working(b, false);
          alert(err.message);
        }
      });
    });

    body.querySelectorAll("[data-deluser]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var row = b.closest("[data-udrawer]");
        var id = row.getAttribute("data-udrawer");
        var u = users.filter(function (x) { return x.id === id; })[0] || {};
        if (!confirm(
          "Delete " + (u.email || id) + " permanently?\n\n" +
          "Their usage history goes with them and they can register again from scratch.\n\n" +
          "To stop someone using REX without erasing the record, suspend them instead."
        )) return;
        working(b, true, "…");
        try {
          await admin("/api/v1/admin/users?id=" + encodeURIComponent(id), { method: "DELETE" });
          showAdminConsole();
        } catch (err) {
          working(b, false);
          alert(err.message);
        }
      });
    });
  }

  /* ---------------------------- devices ------------------------- */

  async function tabDevices(body) {
    var data = await admin("/api/v1/admin/devices");
    var devices = data.devices || [];
    var t = data.totals || {};

    body.innerHTML =
      '<div class="stats">' +
        '<div class="stat"><b>' + num(t.devices) + "</b><span>Machines seen</span></div>" +
        '<div class="stat"><b>' + num(t.shared) + "</b><span>With 2+ accounts</span></div>" +
      "</div>" +

      note("info", "info",
        "<b>One free trial per machine.</b> REX sends a one-way hash of stable hardware " +
        "details — never a MAC address or a hostname, and nothing the website can produce. " +
        "When a second account signs in from a machine that has already spent its trial, that " +
        "account's trial is voided rather than the login being refused, because shared " +
        "machines are real. Reset a machine below when that is the wrong call.") +

      (devices.length
        ? '<div class="tablewrap"><table class="dtable"><thead><tr>' +
          "<th>Machine</th><th>Platform</th><th>Accounts</th><th>State</th>" +
          "<th>First seen</th><th>Last seen</th>" +
          '<th class="shrink"></th></tr></thead><tbody>' +
          devices.map(deviceRow).join("") +
          "</tbody></table></div>"
        : '<div class="slot"><b>No machines yet</b>' +
          "A row appears the first time REX signs in from one.</div>");

    wireDevices(body);
  }

  function deviceRow(d) {
    var accounts = d.accounts || [];
    return (
      "<tr>" +
        '<td class="mono" style="font-size:11.5px">' + esc(String(d.id).slice(0, 16)) + "…</td>" +
        '<td class="mono">' + esc(d.label || "—") + "</td>" +
        "<td>" +
          (accounts.length
            ? accounts.map(function (a) {
                return '<div style="font-size:12.5px' + (a.missing ? ";color:var(--ink-3)" : "") + '">' +
                  esc(a.email || a.name || a.id) + (a.missing ? " <i>(deleted)</i>" : "") + "</div>";
              }).join("")
            : '<span class="dim">—</span>') +
        "</td>" +
        "<td>" +
          (d.blocked
            ? '<span class="state bad"><i></i>blocked</span>'
            : accounts.length > 1
              ? '<span class="state warn"><i></i>shared</span>'
              : '<span class="state ok"><i></i>ok</span>') +
          (d.trialClaimedBy ? ' <span class="state mute"><i></i>trial used</span>' : "") +
        "</td>" +
        "<td>" + when(d.firstSeenAt) + "</td>" +
        "<td>" + when(d.lastSeenAt) + "</td>" +
        '<td class="shrink"><button class="btn btn-sm" data-editdev="' + esc(d.id) + '" type="button">' +
        "<span>Manage</span></button></td>" +
      "</tr>" +

      '<tr class="drawer" hidden data-ddrawer="' + esc(d.id) + '"><td colspan="7"><div class="drawer-in">' +
        "<div><h5>Trial</h5>" +
          "<p class=\"field-hint\" style=\"margin-top:0\">" +
          (d.trialClaimedBy
            ? "This machine has spent its free trial. Any further account signing in from it " +
              "starts with no plan."
            : "This machine has not used a trial yet.") + "</p>" +
          '<div class="form-actions">' +
            '<button class="btn btn-sm" data-resettrial type="button"' + (d.trialClaimedBy ? "" : " disabled") + ">" +
            "<span>Give the trial back</span></button>" +
          "</div>" +
          '<p class="field-hint">Also un-voids the trial on every account this machine carries.</p>' +
        "</div>" +

        "<div><h5>Access</h5>" +
          '<label class="toggle" style="margin-bottom:14px">' +
          '<input type="checkbox" data-df="blocked"' + (d.blocked ? " checked" : "") + '>' +
          '<i class="track"></i><span class="lbl">Block this machine</span></label>' +
          '<p class="field-hint">Blocking refuses REX on this machine whatever plan the account ' +
          "has, and signs out every session on it immediately.</p>" +
        "</div>" +

        "<div><h5>Note</h5>" +
          '<textarea class="textarea" data-df="note" placeholder="Why this machine is flagged.">' +
          esc(d.note || "") + "</textarea>" +
          '<div class="form-actions">' +
            '<button class="btn btn-sm btn-primary" data-savedev type="button"><span>Save</span></button>' +
          "</div>" +
        "</div>" +
      "</div></td></tr>"
    );
  }

  function wireDevices(body) {
    body.querySelectorAll("[data-editdev]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = body.querySelector('[data-ddrawer="' + b.getAttribute("data-editdev") + '"]');
        if (row) row.hidden = !row.hidden;
      });
    });

    body.querySelectorAll("[data-savedev]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var row = b.closest("[data-ddrawer]");
        var id = row.getAttribute("data-ddrawer");
        working(b, true, "Saving…");
        try {
          await admin("/api/v1/admin/devices", {
            method: "PATCH",
            body: {
              id: id,
              blocked: row.querySelector('[data-df="blocked"]').checked,
              note: row.querySelector('[data-df="note"]').value,
            },
          });
          showAdminConsole();
        } catch (err) {
          working(b, false);
          alert(err.message);
        }
      });
    });

    body.querySelectorAll("[data-resettrial]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var row = b.closest("[data-ddrawer]");
        var id = row.getAttribute("data-ddrawer");
        if (!confirm("Give this machine its free trial back?\n\nAny account whose trial was voided because of it becomes eligible again.")) return;
        working(b, true, "…");
        try {
          await admin("/api/v1/admin/devices", { method: "PATCH", body: { id: id, resetTrial: true } });
          showAdminConsole();
        } catch (err) {
          working(b, false);
          alert(err.message);
        }
      });
    });
  }

  /* --------------------------- activity ------------------------- */

  async function tabActivity(body) {
    var data = await admin("/api/v1/admin/audit?limit=250");
    var rows = data.entries || [];

    body.innerHTML =
      "<p class=\"small\" style=\"margin-bottom:20px;max-width:62ch\">Every administrative action, newest " +
      "first. Kept to the last 2000 entries.</p>" +
      (rows.length
        ? '<div class="tablewrap"><table class="dtable"><thead><tr>' +
          "<th>When</th><th>Action</th><th>Detail</th></tr></thead><tbody>" +
          rows.map(function (r) {
            var detail = Object.keys(r)
              .filter(function (k) { return k !== "at" && k !== "action"; })
              .map(function (k) { return k + "=" + JSON.stringify(r[k]); })
              .join("  ");
            return (
              "<tr><td style=\"white-space:nowrap\">" + when(r.at) + "</td>" +
              '<td class="mono">' + esc(r.action) + "</td>" +
              '<td class="mono" style="font-size:11.5px;color:var(--ink-3)">' + esc(detail) + "</td></tr>"
            );
          }).join("") +
          "</tbody></table></div>"
        : '<div class="slot"><b>Nothing logged yet</b>Actions appear here as you take them.</div>');
  }

  /* --------------------------- settings ------------------------- */

  async function tabSettings(body) {
    var h = await call("/api/v1/health");
    var s = await admin("/api/v1/admin/session");

    body.innerHTML =
      '<div class="grid grid-2">' +
        '<div class="panel">' +
          '<span class="panel-n">This server</span>' +
          '<div class="drawer" style="background:none;border:0">' +
            '<div class="row"><span>Public URL</span><code class="mono" style="font-size:11.5px">' + esc(h.publicUrl) + "</code></div>" +
            '<div class="row"><span>Email sign-in</span><span class="state ok"><i></i>on</span></div>' +
            '<div class="row"><span>OAuth providers</span>' +
              (h.providers && h.providers.length
                ? '<span class="state ok"><i></i>' + h.providers.map(function (p) { return esc(p.id); }).join(", ") + "</span>"
                : '<span class="state warn"><i></i>none configured</span>') + "</div>" +
            '<div class="row"><span>New accounts</span><span class="state mute"><i></i>' + esc(h.accessMode) + "</span></div>" +
            '<div class="row"><span>Admin user</span><code class="mono" style="font-size:11.5px">' + esc(s.username || "—") + "</code></div>" +
            '<div class="row"><span>Password changed</span><span class="mono" style="font-size:11.5px">' + when(s.passwordChangedAt) + "</span></div>" +
          "</div>" +
          (h.providers && h.providers.length
            ? ""
            : note("warn", "info",
                "<b>No OAuth provider is configured.</b> Email sign-in works regardless. To add " +
                "GitHub or Google, set their client id and secret in <code>server/.env</code> and " +
                "restart.") ) +
        "</div>" +

        '<div class="panel">' +
          '<span class="panel-n">Credentials</span>' +
          '<h3 class="h3">Change the console password</h3>' +
          "<p>Signs out every other console session on every device.</p>" +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" id="gocred" type="button">' + svg("lock", 14) +
            "<span>Change credentials</span></button>" +
          "</div>" +
          '<p class="small" style="margin-top:20px">Locked out? Delete ' +
          "<code>server/data/admin.json</code> on the server and restart — it bootstraps again from " +
          "the <code>ADMIN_BOOTSTRAP_*</code> variables.</p>" +
        "</div>" +
      "</div>";

    document.getElementById("gocred").addEventListener("click", function () { showAdminCredentials(false); });
  }

  /* ================================================================
     Entry
     ================================================================ */

  /* The verify endpoint bounces back here with the result. Show it once and
     strip it from the URL, so a refresh does not re-announce something that
     happened five minutes ago. */
  var verifyBanner = "";
  (function () {
    var q = new URLSearchParams(location.search);
    if (!q.has("verified")) return;
    var ok = q.get("verified") === "1";
    verifyBanner = note(ok ? "good" : "bad", ok ? "check" : "alert", esc(q.get("m") || ""));
    q.delete("verified");
    q.delete("m");
    history.replaceState({}, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  })();

  async function start() {
    var params = new URLSearchParams(location.search);

    if (location.hash === "#admin") {
      var a = readAdmin();
      if (a && a.token) return showAdminConsole();
      return showAdminLogin();
    }

    if (params.get("code")) return completeLogin(params.get("code"));

    var conf = { providers: [], allowSignup: true };
    try {
      conf = await call("/api/v1/auth/providers");
    } catch (e) {
      return fail("Cannot reach the sign-in server", API);
    }

    if (params.get("device")) {
      // The agent says which form it wanted; honour it so the first thing the
      // user sees is the thing they asked for.
      if (params.get("mode") === "register") mode = "register";
      return showDevice(params.get("device"), conf);
    }

    var session = readSession();
    if (session && session.accessToken) {
      // Confirm the token is still good rather than trusting what is cached —
      // it may have been revoked from the console since this tab loaded.
      try {
        var fresh = await call("/api/v1/auth/me", { token: session.accessToken });
        session.user = fresh.user;
        session.entitlement = fresh.entitlement;
        writeSession(session);
        paintNav();
        return showAccount(session);
      } catch (err) {
        if (err.status !== 401) return fail("Cannot reach the server", "Check your connection and reload.");
        writeSession(null);
        paintNav();
      }
    }

    showAuth(conf);
  }

  window.addEventListener("hashchange", start);
  start();
})();
