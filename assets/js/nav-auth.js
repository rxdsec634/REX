/* ==================================================================
   Nav sign-in state, on every page except the account page itself.

   This replaces the nav half of the old account.js, which read a
   session key that no longer exists — so the nav said "Login" even
   to someone already signed in, and shipped 79 KB to say it.

   Deliberately does no network call. The nav is decoration: getting
   it wrong costs a wrong label, and making every page wait on a
   round trip to render its header is a worse trade. The account page
   is the one that actually verifies.
   ================================================================== */
(function () {
  "use strict";

  if (!window.SB) return;

  var s = window.SB.Session.get();
  if (!s || !s.access_token) return; // signed out — markup already says Login

  // A token past its expiry is not a session. Saying "Account" here would
  // send someone to a page that immediately tells them to sign in again.
  if (s.expires_at && Date.now() >= s.expires_at) return;

  document.querySelectorAll("[data-auth-label]").forEach(function (el) {
    el.textContent = "Account";
  });
})();
