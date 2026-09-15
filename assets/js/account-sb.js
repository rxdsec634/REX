/* ==================================================================
   Account page, backed by Supabase.

   There is no server behind this any more. Sign-in is Supabase Auth,
   the profile is a row in Postgres, and Row Level Security decides
   what may be read or written — which is why this can be plain
   client-side code without handing anyone the keys to their own plan.

   What a user may change here is their display name, and nothing
   else. `approved`, `plan` and `suspended` are not writable by them:
   Postgres refuses those columns outright, so the absence of a form
   field is a convenience, not the control.
   ================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("account");
  if (!root || !window.SB) return;

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function svg(n, s) {
    return '<svg class="icon" width="' + (s || 16) + '" height="' + (s || 16) +
      '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  }

  function render(html) {
    root.innerHTML = html;
    root.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  function note(kind, icon, html) {
    return '<div class="note note-' + kind + '">' + svg(icon, 15) + "<div>" + html + "</div></div>";
  }

  function busy(msg) {
    render('<div class="slot"><b>' + esc(msg) + "</b>One moment.</div>");
  }

  /* ------------------------------ views ------------------------------ */

  function signedOut(err) {
    render(
      '<div class="grid grid-2">' +
        '<div class="panel">' +
          '<span class="panel-n">Sign in</span>' +
          (err ? note("bad", "alert", esc(err)) : "") +
          '<p class="field-hint" style="margin:-4px 0 20px">' +
            "Use the account you already have. REX checks it to know the agent is " +
            "entitled to run." +
          "</p>" +
          '<div class="hero-actions" style="flex-direction:column;align-items:stretch;gap:12px">' +
            '<button class="btn" type="button" data-p="google">' + svg("globe", 15) +
              "<span>Continue with Google</span></button>" +
            '<button class="btn" type="button" data-p="github">' + svg("github", 15) +
              "<span>Continue with GitHub</span></button>" +
          "</div>" +
        "</div>" +
        '<div class="panel">' +
          '<span class="panel-n">What the account is for</span>' +
          '<h3 class="h3">REX will not run without one</h3>' +
          "<p>Signing in is what tells the agent it may run and which permissions it has. " +
          "Access is granted by hand, so a new account waits for approval before REX will start.</p>" +
          '<p class="small" style="margin-top:16px">We store the email, display name and avatar the ' +
          "provider gives us. Nothing else leaves your machine.</p>" +
        "</div>" +
      "</div>"
    );

    root.querySelectorAll("[data-p]").forEach(function (b) {
      b.addEventListener("click", function () {
        window.SB.signInWith(b.getAttribute("data-p"), location.href);
      });
    });
  }

  function planLine(p) {
    if (p.suspended) return '<span class="state bad"><i></i>Suspended</span>';
    if (!p.approved) return '<span class="state warn"><i></i>Waiting for approval</span>';
    if (p.plan === "pro") return '<span class="state ok"><i></i>Pro</span>';
    if (p.plan === "none") return '<span class="state bad"><i></i>No access</span>';

    var left = null;
    if (p.trial_ends_at) {
      left = Math.ceil((new Date(p.trial_ends_at) - Date.now()) / 86400000);
    }
    if (left === null) return '<span class="state ok"><i></i>Trial</span>';
    if (left <= 0) return '<span class="state bad"><i></i>Trial expired</span>';
    return '<span class="state ok"><i></i>Trial — ' + left + " day" + (left === 1 ? "" : "s") + " left</span>";
  }

  function signedIn(p) {
    var initial = (p.name || p.email || "?").trim().charAt(0).toUpperCase();

    render(
      '<div class="grid grid-2">' +
        '<div class="panel">' +
          '<span class="panel-n">Signed in</span>' +
          '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">' +
            '<div style="width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;' +
              'border:1px solid var(--rule);font-weight:600">' + esc(initial) + "</div>" +
            "<div><b>" + esc(p.name || "—") + "</b>" +
            '<div class="small mono">' + esc(p.email || "") + "</div></div>" +
          "</div>" +

          '<div class="kv"><span>Status</span>' + planLine(p) + "</div>" +
          '<div class="kv"><span>Offensive mode</span>' +
            (p.offensive
              ? '<span class="state ok"><i></i>Granted</span>'
              : '<span class="state warn"><i></i>Not granted</span>') +
          "</div>" +

          (!p.approved && !p.suspended
            ? note("warn", "info",
                "Your account is waiting to be approved. REX will not run until then — " +
                "you do not need to do anything, and this page will show the change once it happens.")
            : "") +

          (!p.offensive && !p.suspended
            ? note("warn", "info",
                "REX runs, but its offensive tooling is switched off. That part is granted " +
                "by hand, per person — ask if you need it, and say what you are testing.")
            : "") +

          (p.suspended
            ? note("bad", "alert", "This account has been suspended. Get in touch if you think that is wrong.")
            : "") +

          '<label class="field" style="margin-top:20px"><span>Display name</span>' +
            '<input class="input" id="nm" maxlength="80" value="' + esc(p.name || "") + '"></label>' +
          '<div id="nmmsg"></div>' +

          '<div class="form-actions">' +
            '<button class="btn btn-sm" type="button" id="save">' + svg("check", 14) + "<span>Save name</span></button>" +
            '<span class="spacer"></span>' +
            '<button class="btn btn-sm" type="button" id="out">' + svg("power", 14) + "<span>Sign out</span></button>" +
          "</div>" +
        "</div>" +

        '<div class="panel">' +
          '<span class="panel-n">Account</span>' +

          '<div class="kv"><span>Plan</span><code class="mono">' + esc(p.plan || "—") + "</code></div>" +
          '<div class="kv"><span>Signed up</span><code class="mono">' +
            esc(p.created_at ? String(p.created_at).slice(0, 10) : "—") + "</code></div>" +
          '<div class="kv"><span>Email</span><code class="mono">' + esc(p.email || "—") + "</code></div>" +

          '<h3 class="h3" style="margin-top:24px">Your machines</h3>' +
          "<p class=\"small\">REX binds to the computer you first sign in on, which is how one " +
          "account gets one trial. These are read-only — releasing a machine is not something " +
          "you can do yourself, because that would hand back the limit it exists to enforce.</p>" +
          '<div id="devs" class="small mono" style="margin-top:12px">Loading…</div>' +

          '<div class="form-actions" style="margin-top:22px">' +
            '<a class="btn btn-primary" href="downloads.html">' + svg("download", 14) + "<span>Downloads</span></a>" +
            '<span class="spacer"></span>' +
            '<button class="btn btn-sm" type="button" id="outall">' + svg("power", 14) +
              "<span>Sign out everywhere</span></button>" +
          "</div>" +
          '<div id="allmsg"></div>' +
        "</div>" +
      "</div>"
    );

    document.getElementById("out").addEventListener("click", async function () {
      busy("Signing out");
      await window.SB.signOut();
      signedOut();
    });

    // Devices load after the panel renders: it is extra information, and the
    // page should not wait on a second request to show the account itself.
    (function () {
      var box = document.getElementById("devs");
      if (!box || !window.SB.listDevices) return;
      window.SB.listDevices()
        .then(function (rows) {
          if (!rows || !rows.length) {
            box.textContent = "No machine has signed in yet.";
            return;
          }
          box.innerHTML = rows
            .map(function (d) {
              return '<div class="kv"><span>' + esc(d.label || "unknown") + "</span>" +
                "<code>" + esc(String(d.id).slice(0, 12)) + "… · " +
                esc(String(d.claimed_at || "").slice(0, 10)) + "</code></div>";
            })
            .join("");
        })
        .catch(function (e) {
          box.textContent = "Could not load machines: " + e.message;
        });
    })();

    document.getElementById("outall").addEventListener("click", async function () {
      var warn = "Sign out of RXDSEC everywhere?" + String.fromCharCode(10, 10) +
        "Every browser and every copy of REX will need to sign in again, including this one.";
      if (!confirm(warn)) return;
      var box = document.getElementById("allmsg");
      box.innerHTML = "";
      try {
        // scope=global, so the refresh tokens held by REX stop working too —
        // a sign-out that leaves the desktop app signed in is not one.
        await window.SB.signOut(true);
        signedOut();
      } catch (e) {
        box.innerHTML = note("bad", "alert", esc(e.message));
      }
    });

    document.getElementById("save").addEventListener("click", async function () {
      var box = document.getElementById("nmmsg");
      var value = document.getElementById("nm").value.trim();
      box.innerHTML = "";
      try {
        await window.SB.rename(value);
        box.innerHTML = note("good", "check", "Saved.");
      } catch (e) {
        box.innerHTML = note("bad", "alert", esc(e.message));
      }
    });
  }

  /* ------------------------------ boot ------------------------------- */

  /* ---------------------- desktop hand-off ---------------------- */
  /* REX opens this page with ?rex=<loopback port>&state=<one-time>. Once a
     session exists we send it back by navigating to that listener.

     The tokens go in the QUERY string, not the fragment: a fragment is never
     sent to a server, so the listener would receive nothing. The destination is
     127.0.0.1, so they do not leave the machine, and REX checks the state value
     so a page it did not open cannot push a session at it. */
  function handOffToRex(q) {
    var port = q.get("rex");
    var state = q.get("state");
    if (!port || !/^[0-9]{1,5}$/.test(port) || !state) return false;

    var s = window.SB.Session.get();
    if (!s || !s.access_token) return false;

    var u = "http://127.0.0.1:" + port + "/cb" +
      "?state=" + encodeURIComponent(state) +
      "&access_token=" + encodeURIComponent(s.access_token) +
      "&refresh_token=" + encodeURIComponent(s.refresh_token || "") +
      "&expires_in=" + Math.max(60, Math.round(((s.expires_at || 0) - Date.now()) / 1000));

    render('<div class="slot"><b>Returning you to REX</b>You can close this tab.</div>');
    location.href = u;
    return true;
  }

  (async function () {
    busy("Checking your account");

    // An OAuth round trip comes back with the tokens in the fragment.
    window.SB.Session.adopt();

    // Providers report failures the same way — in the URL, not as an error.
    var q = new URLSearchParams(location.search);
    if (q.get("error")) {
      return signedOut(q.get("error_description") || q.get("error"));
    }

    // REX asked for a specific provider and there is no session yet: go
    // straight there. Without this the user picks a provider twice.
    if (q.get("rex") && q.get("provider") && !window.SB.Session.get()) {
      return window.SB.signInWith(q.get("provider"), location.href);
    }

    var profile;
    try {
      profile = await window.SB.me();
    } catch (e) {
      return signedOut(e.message);
    }

    if (!profile) return signedOut();

    // Signed in and REX is waiting: hand the session over rather than showing
    // an account page the user did not ask for.
    if (handOffToRex(q)) return;

    signedIn(profile);
  })();
})();
