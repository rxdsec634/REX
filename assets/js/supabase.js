/* ==================================================================
   Supabase client — just enough of it, written by hand.

   The official SDK would work, but it is a bundle pulled from a CDN
   into a site that otherwise has no dependencies and no build step.
   Everything this page needs is four REST calls, so the honest trade
   is to write them out rather than take the bundle and the CDN.

   Auth lives entirely in Supabase; the tables are protected by Row
   Level Security, so this file holds no secret. The publishable key
   identifies the project, it does not grant access.
   ================================================================== */
(function (global) {
  "use strict";

  var URL_BASE = "https://xxpwzrwbrefctvkyufay.supabase.co";
  var PUBLISHABLE = "sb_publishable_miaVr63IVGxCKs5R8ARCYg_nYM6WOBC";

  /* Tokens live in sessionStorage, not localStorage: they die with the tab
     rather than sitting on disk until someone clears site data. The cost is
     signing in again in a new tab, which for a licence page is the right side
     of that trade. */
  var KEY = "rxdsec.sb";

  function store(v) {
    try {
      if (v === undefined) return JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (v === null) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, JSON.stringify(v));
    } catch (e) {
      /* private mode: everything still works, it just will not persist */
    }
    return v;
  }

  function headers(token) {
    var h = { apikey: PUBLISHABLE, "content-type": "application/json" };
    if (token) h.authorization = "Bearer " + token;
    return h;
  }

  async function request(path, opts) {
    opts = opts || {};
    var res = await fetch(URL_BASE + path, {
      method: opts.method || "GET",
      headers: headers(opts.token),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
    if (!res.ok) {
      var msg = (json && (json.msg || json.error_description || json.message || json.error)) || ("HTTP " + res.status);
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  /* ----------------------------- session ----------------------------- */

  var Session = {
    get: function () { return store(); },
    clear: function () { store(null); },

    save: function (s) {
      if (!s || !s.access_token) return null;
      return store({
        access_token: s.access_token,
        refresh_token: s.refresh_token || null,
        // expires_in is seconds from now; store the absolute moment so a tab
        // reopened later can tell the difference between fresh and stale.
        expires_at: Date.now() + (Number(s.expires_in || 3600) * 1000),
      });
    },

    /* Read the tokens Supabase leaves in the URL fragment after OAuth, then
       strip them. Leaving them there would put an access token in the address
       bar, in history, and in anything the user pastes. */
    adopt: function () {
      if (!location.hash || location.hash.indexOf("access_token") === -1) return null;
      var p = new URLSearchParams(location.hash.slice(1));
      var saved = Session.save({
        access_token: p.get("access_token"),
        refresh_token: p.get("refresh_token"),
        expires_in: p.get("expires_in"),
      });
      history.replaceState(null, "", location.pathname + location.search);
      return saved;
    },

    /* Supabase access tokens last an hour. Refresh a little early rather than
       letting a request fail and having to reason about retrying it. */
    valid: async function () {
      var s = store();
      if (!s) return null;
      if (Date.now() < s.expires_at - 60_000) return s;
      if (!s.refresh_token) { Session.clear(); return null; }
      try {
        var out = await request("/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          body: { refresh_token: s.refresh_token },
        });
        return Session.save(out);
      } catch (e) {
        Session.clear();
        return null;
      }
    },
  };

  /* ------------------------------- auth ------------------------------ */

  function signInWith(provider, returnTo) {
    var u = new URL(URL_BASE + "/auth/v1/authorize");
    u.searchParams.set("provider", provider);
    u.searchParams.set("redirect_to", returnTo || location.origin + location.pathname);
    location.href = u.toString();
  }

  async function signOut() {
    var s = store();
    if (s) {
      // Best effort: the local session is gone either way, and a failed
      // revoke must not leave the user looking signed in.
      try { await request("/auth/v1/logout", { method: "POST", token: s.access_token }); } catch (e) {}
    }
    Session.clear();
  }

  async function me() {
    var s = await Session.valid();
    if (!s) return null;
    var rows = await request("/rest/v1/profiles?select=*", { token: s.access_token });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async function rename(name) {
    var s = await Session.valid();
    if (!s) throw new Error("Not signed in.");
    var user = await request("/auth/v1/user", { token: s.access_token });
    return request("/rest/v1/profiles?id=eq." + encodeURIComponent(user.id), {
      method: "PATCH",
      token: s.access_token,
      body: { name: name },
    });
  }

  /* ------------------------------ devices ----------------------------- */
  /* The machines this account has claimed. Read-only on purpose: the row is
     what stops one computer collecting a second trial, so letting someone
     delete their own would hand back the hole it exists to close. Showing them
     is still worth it — "why does it say I already have a device" is a fair
     question to be able to answer. */
  async function listDevices() {
    var s = await Session.valid();
    if (!s) throw new Error("Not signed in.");
    return request("/rest/v1/devices?select=id,label,claimed_at&order=claimed_at.desc", { token: s.access_token });
  }

  global.SB = {
    url: URL_BASE,
    listDevices: listDevices,
    Session: Session,
    signInWith: signInWith,
    signOut: signOut,
    me: me,
    rename: rename,
    request: request,
  };
})(window);
