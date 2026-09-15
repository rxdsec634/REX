/**
 * Prove the security model holds, by attacking it.
 *
 *   node supabase/verify-rls.mjs <project-url> <anon-key>
 *
 * With no server in front of the database, Row Level Security and the column
 * GRANTs ARE the security. Nothing stops a user calling the REST API directly
 * with their own token, so the only honest way to know the rules are right is
 * to try the attacks and confirm they fail.
 *
 * Everything here runs as an ordinary signed-in user, never as service_role.
 */
const [, , URL_ARG, ANON] = process.argv;
if (!URL_ARG || !ANON) {
  console.error("usage: node supabase/verify-rls.mjs <project-url> <anon-key>");
  process.exit(2);
}
const BASE = URL_ARG.replace(/\/$/, "");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

async function api(path, { method = "GET", token, body, prefer } = {}) {
  const headers = { apikey: ANON, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (prefer) headers.prefer = prefer;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text };
}

async function signUp(email, password) {
  const r = await api("/auth/v1/signup", { method: "POST", body: { email, password } });
  if (!r.json?.access_token) {
    // Email confirmation may be on; fall back to password grant.
    const l = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
    return l.json?.access_token ? { token: l.json.access_token, id: l.json.user?.id } : { error: r.text };
  }
  return { token: r.json.access_token, id: r.json.user?.id };
}

const stamp = Date.now();
const A = { email: `rls-a-${stamp}@example.com`, password: "Testpass123!x" };
const B = { email: `rls-b-${stamp}@example.com`, password: "Testpass123!x" };

console.log("\nSigning up two users…");
const a = await signUp(A.email, A.password);
const b = await signUp(B.email, B.password);
if (!a.token || !b.token) {
  console.error("Could not obtain tokens. If email confirmation is ON, disable it for this test.");
  console.error("A:", a.error || "(ok)", "\nB:", b.error || "(ok)");
  process.exit(2);
}

console.log("\n-- what a user SHOULD be able to do --");
const own = await api(`/rest/v1/profiles?select=*`, { token: a.token });
check("read own profile", own.status === 200 && Array.isArray(own.json) && own.json.length === 1);
check("own profile starts unapproved", own.json?.[0]?.approved === false, `approved=${own.json?.[0]?.approved}`);
check("own profile starts on trial", own.json?.[0]?.plan === "trial", `plan=${own.json?.[0]?.plan}`);

const rename = await api(`/rest/v1/profiles?id=eq.${a.id}`, {
  method: "PATCH", token: a.token, body: { name: "Renamed" }, prefer: "return=representation",
});
check("rename own profile", rename.status === 200);

console.log("\n-- what a user MUST NOT be able to do --");
const toPro = await api(`/rest/v1/profiles?id=eq.${a.id}`, {
  method: "PATCH", token: a.token, body: { plan: "pro" }, prefer: "return=representation",
});
check("CANNOT set own plan to pro", toPro.status >= 400, `got ${toPro.status} ${toPro.text.slice(0, 120)}`);

const approveSelf = await api(`/rest/v1/profiles?id=eq.${a.id}`, {
  method: "PATCH", token: a.token, body: { approved: true }, prefer: "return=representation",
});
check("CANNOT approve self", approveSelf.status >= 400, `got ${approveSelf.status}`);

const unsuspend = await api(`/rest/v1/profiles?id=eq.${a.id}`, {
  method: "PATCH", token: a.token, body: { suspended: false }, prefer: "return=representation",
});
check("CANNOT write suspended flag", unsuspend.status >= 400, `got ${unsuspend.status}`);

const others = await api(`/rest/v1/profiles?select=id,email&id=eq.${b.id}`, { token: a.token });
check("CANNOT read another user's profile", Array.isArray(others.json) && others.json.length === 0,
  `returned ${JSON.stringify(others.json)?.slice(0, 120)}`);

const listAll = await api(`/rest/v1/profiles?select=id`, { token: a.token });
check("CANNOT enumerate all users", Array.isArray(listAll.json) && listAll.json.length <= 1,
  `returned ${listAll.json?.length} rows`);

console.log("\n-- device binding (the anti-trial-farming control) --");
const dev = `dev-${stamp}`;
const claim = await api(`/rest/v1/devices`, {
  method: "POST", token: a.token, body: { id: dev, user_id: a.id, label: "test" }, prefer: "return=representation",
});
check("can claim a device for self", claim.status === 201, `got ${claim.status} ${claim.text.slice(0, 120)}`);

const steal = await api(`/rest/v1/devices`, {
  method: "POST", token: b.token, body: { id: dev, user_id: b.id }, prefer: "return=representation",
});
check("second user CANNOT re-claim the same machine", steal.status >= 400, `got ${steal.status}`);

const claimForOther = await api(`/rest/v1/devices`, {
  method: "POST", token: b.token, body: { id: `${dev}-x`, user_id: a.id }, prefer: "return=representation",
});
check("CANNOT claim a device in someone else's name", claimForOther.status >= 400, `got ${claimForOther.status}`);

const delDev = await api(`/rest/v1/devices?id=eq.${dev}`, { method: "DELETE", token: a.token });
const stillThere = await api(`/rest/v1/devices?select=id&id=eq.${dev}`, { token: a.token });
check("CANNOT delete a device to free up a trial",
  delDev.status >= 400 || (Array.isArray(stillThere.json) && stillThere.json.length === 1),
  `delete returned ${delDev.status}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
