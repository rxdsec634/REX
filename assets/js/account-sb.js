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
        window.SB.signInWith(b.getAttribute("data-p"), location.origin + location.pathname);
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
          '<span class="panel-n">Using REX</span>' +
          '<h3 class="h3">' + (p.approved ? "You are good to go" : "Once approved") + "</h3>" +
          "<p>Download REX, sign in with this same account, and the agent picks up your " +
          "entitlement. One machine per account — the first computer you sign in on is the " +
          "one it binds to.</p>" +
          '<div class="form-actions" style="margin-top:18px">' +
            '<a class="btn btn-primary" href="downloads.html">' + svg("download", 14) + "<span>Downloads</span></a>" +
            '<span class="spacer"></span>' +
            '<a class="btn btn-sm" href="pricing.html">' + svg("externalLink", 14) + "<span>Plans</span></a>" +
          "</div>" +
        "</div>" +
      "</div>"
    );

    document.getElementById("out").addEventListener("click", async function () {
      busy("Signing out");
      await window.SB.signOut();
      signedOut();
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

  (async function () {
    busy("Checking your account");

    // An OAuth round trip comes back with the tokens in the fragment.
    window.SB.Session.adopt();

    // Providers report failures the same way — in the URL, not as an error.
    var q = new URLSearchParams(location.search);
    if (q.get("error")) {
      return signedOut(q.get("error_description") || q.get("error"));
    }

    var profile;
    try {
      profile = await window.SB.me();
    } catch (e) {
      return signedOut(e.message);
    }

    if (!profile) return signedOut();
    signedIn(profile);
  })();
})();
