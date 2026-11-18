#!/usr/bin/env node
/**
 * Proof script (AI-2, milestone 3b). Runs from your own machine against the God's Grace Supabase project and checks
 * the claims in docs/security/07-identity-adapter-spec.md that only the real Auth service can settle.
 *
 *   node --env-file=.env.local scripts/security/prove-auth.mjs
 *   node --env-file=.env.local scripts/security/prove-auth.mjs --dry-run
 *   node --env-file=.env.local scripts/security/prove-auth.mjs --only=P1,P2
 *   node --env-file=.env.local scripts/security/prove-auth.mjs --skip-signup-emails
 *
 * It creates throwaway users named name+gg-proof-<run>-<tag>@your.domain and deletes them at the end (also on Ctrl+C).
 * It only ever deletes users it created in this run. It never prints tokens, passwords or secrets: only a status, a
 * short error code and the facts being proven. Needs: NEXT_PUBLIC_SUPABASE_URL, a public key
 * (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY, PROOF_EMAIL_BASE.
 * Result words: PASS, FAIL (a claim is wrong: tell AI-2), TODO (a project setting still needs changing), INFO.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { decodeClaims, errSummary, makeEmail, randomPassword, secondsUntilNextStep, stepOf, totpCode, utf8Length } from "./prove-auth-lib.mjs";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const SKIP_SIGNUP_EMAILS = argv.includes("--skip-signup-emails");
const ONLY = (argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const EXPECTED_REF = process.env.PROOF_EXPECT_PROJECT_REF ?? "cbxvgkbervkatpejgdag";
const RUN = randomBytes(3).toString("hex");

const out = (s = "") => process.stdout.write(`${s}\n`);
const die = (s) => { process.stderr.write(`${s}\n`); process.exit(2); };

// ---------- config ----------
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.PROOF_EMAIL_BASE;
const missing = [["NEXT_PUBLIC_SUPABASE_URL", URL_], ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or _ANON_KEY)", PUB], ["SUPABASE_SERVICE_ROLE_KEY", SERVICE], ["PROOF_EMAIL_BASE", BASE]].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) die(`Missing: ${missing.join(", ")}`);
let host;
try { host = new URL(URL_).hostname; } catch { die("NEXT_PUBLIC_SUPABASE_URL is not a URL"); }
if (!host.startsWith(`${EXPECTED_REF}.`)) die(`Refusing to run: ${host} is not the God's Grace project (${EXPECTED_REF}). Set PROOF_EXPECT_PROJECT_REF only if you mean it.`);
try { makeEmail(BASE, RUN, "x"); } catch (e) { die(e.message); }

const GROUPS = [
  ["P1", "a revoked session is noticed by the live check", p1],
  ["P2", "ending every session of a user by id", p2],
  ["P3", "ending one session needs the right owner", p3],
  ["P4", "sign out scopes (and why the default is dangerous)", p4],
  ["P5", "password check on a throwaway session leaves the real one alone", p5],
  ["P6", "unverified email only shows after a correct password", p6],
  ["P7", "sign up for an existing address", p7],
  ["P8", "MFA: enrol, verify, aal1 to aal2, wrong code", p8],
  ["P9", "MFA recovery with two authenticators", p9],
  ["P10", "password reset link", p10],
  ["P11", "password limits and leaked password protection", p11],
  ["P12", "access token lifetime", p12],
  ["P13", "a new sign in gets a new session", p13],
];
const selected = GROUPS.filter(([id]) => !ONLY.length || ONLY.includes(id));

if (DRY) {
  out(`Dry run. Project ${host}. Run id ${RUN}. Keys present: public yes, service role yes. Email base ok.`);
  out("Would run:"); for (const [id, title] of selected) out(`  ${id}  ${title}`);
  out("No network calls were made."); process.exit(0);
}

// ---------- plumbing ----------
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(URL_, SERVICE, opts);
const anon = () => createClient(URL_, PUB, opts);
const created = [];
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function report(id, title, status, detail = "") {
  results.push({ id, status });
  out(`${status.padEnd(5)} ${id.padEnd(5)} ${title}${detail ? ` : ${detail}` : ""}`);
}

async function makeUser(tag, { confirmed = true } = {}) {
  const email = makeEmail(BASE, RUN, tag);
  const password = randomPassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmed });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(email, password) {
  const client = anon();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("no session");
  const token = data.session.access_token;
  return { client, token, refresh: data.session.refresh_token, claims: decodeClaims(token) };
}

/** Asks the Auth server about exactly this token, the way the resolver does. */
async function live(token) {
  const { data, error } = await anon().auth.getUser(token);
  return { ok: !error && !!data?.user, status: error?.status, code: error?.code };
}
async function canRefresh(refresh) {
  const { data, error } = await anon().auth.refreshSession({ refresh_token: refresh });
  return !error && !!data?.session;
}
const secondsLeft = (claims) => Math.round(claims.exp - Date.now() / 1000);
const rpc = async (fn, args) => { const { data, error } = await admin.rpc(fn, args); if (error) throw error; return data; };

const usedSteps = new Map();
/** A TOTP code for a window this secret has not used yet, and not about to expire. */
async function freshCode(secret) {
  for (;;) {
    const now = Date.now();
    if (stepOf(now) > (usedSteps.get(secret) ?? -1) && secondsUntilNextStep(now) > 4) break;
    const wait = secondsUntilNextStep(now) + 1;
    out(`      (waiting ${wait}s for the next authenticator window)`);
    await sleep(wait * 1000);
  }
  usedSteps.set(secret, stepOf(Date.now()));
  return totpCode(secret, Date.now());
}

// ---------- checks ----------
async function p1(r) {
  const u = await makeUser("p1");
  const s = await signIn(u.email, u.password);
  const before = await live(s.token);
  const left = secondsLeft(s.claims);
  await s.client.auth.signOut({ scope: "local" });
  const after = await live(s.token);
  const refreshed = await canRefresh(s.refresh);
  r("P1a", "token is accepted before sign out", before.ok ? "PASS" : "FAIL", before.ok ? "" : errSummary(before));
  r("P1b", "the same token still has time left locally (so a signature check alone would accept it)", left > 30 ? "PASS" : "FAIL", `${left}s left`);
  r("P1c", "live check rejects it after sign out", !after.ok && after.status >= 400 && after.status < 500 ? "PASS" : "FAIL", `getUser after sign out: ${errSummary(after)}`);
  r("P1d", "refresh token no longer works", refreshed ? "FAIL" : "PASS");
}

async function p2(r) {
  const u = await makeUser("p2");
  const a = await signIn(u.email, u.password);
  const b = await signIn(u.email, u.password);
  const count = await rpc("revoke_all_sessions", { target_user_id: u.id });
  const [la, lb, ra, rb] = [await live(a.token), await live(b.token), await canRefresh(a.refresh), await canRefresh(b.refresh)];
  r("P2a", "revoke_all_sessions reports how many it ended", count === 2 ? "PASS" : "FAIL", `returned ${count}, expected 2`);
  r("P2b", "both access tokens are refused at once", !la.ok && !lb.ok ? "PASS" : "FAIL", `${errSummary(la)} / ${errSummary(lb)}`);
  r("P2c", "neither refresh token can mint a new token (cascade to refresh tokens)", !ra && !rb ? "PASS" : "FAIL");
  r("P2d", "the user account itself is untouched", (await signIn(u.email, u.password)).token ? "PASS" : "FAIL");
}

async function p3(r) {
  const alice = await makeUser("p3a");
  const bob = await makeUser("p3b");
  const sa = await signIn(alice.email, alice.password);
  const wrong = await rpc("revoke_session", { target_user_id: bob.id, target_session_id: sa.claims.session_id });
  const stillLive = await live(sa.token);
  const right = await rpc("revoke_session", { target_user_id: alice.id, target_session_id: sa.claims.session_id });
  const gone = await live(sa.token);
  r("P3a", "someone else's user id cannot end the session", wrong === false && stillLive.ok ? "PASS" : "FAIL", `returned ${wrong}, session ${stillLive.ok ? "still live" : "ended"}`);
  r("P3b", "the owner's user id ends it", right === true && !gone.ok ? "PASS" : "FAIL", `returned ${right}, ${errSummary(gone)}`);
}

async function p4(r) {
  const u = await makeUser("p4");
  const [s1, s2, s3] = [await signIn(u.email, u.password), await signIn(u.email, u.password), await signIn(u.email, u.password)];
  await s1.client.auth.signOut({ scope: "others" });
  const [l1, l2, l3] = [await live(s1.token), await live(s2.token), await live(s3.token)];
  r("P4a", "scope others keeps this session and ends the rest", l1.ok && !l2.ok && !l3.ok ? "PASS" : "FAIL", `this ${l1.ok ? "live" : "ended"}, others ${l2.ok ? "live" : "ended"}/${l3.ok ? "live" : "ended"}`);
  await s1.client.auth.signOut({ scope: "local" });
  r("P4b", "scope local ends this session", !(await live(s1.token)).ok ? "PASS" : "FAIL");
  const [t1, t2] = [await signIn(u.email, u.password), await signIn(u.email, u.password)];
  await t1.client.auth.signOut();
  const other = await live(t2.token);
  r("P4c", "a bare signOut() ends the user's OTHER sessions too (default is global, so the adapter must always pass a scope)", !other.ok ? "PASS" : "FAIL", other.ok ? "other session survived: the default is not global, tell AI-2" : "");
}

async function p5(r) {
  const u = await makeUser("p5");
  const real = await signIn(u.email, u.password);
  const throwaway = await signIn(u.email, u.password);
  await throwaway.client.auth.signOut({ scope: "local" });
  const [t, re] = [await live(throwaway.token), await live(real.token)];
  r("P5a", "closing the throwaway session ends it", !t.ok ? "PASS" : "FAIL");
  r("P5b", "the member's real session is untouched", re.ok ? "PASS" : "FAIL");
  const wrong = await anon().auth.signInWithPassword({ email: u.email, password: `${u.password}x` });
  r("P5c", "a wrong password is reported with the code the adapter expects", wrong.error?.code === "invalid_credentials" ? "PASS" : "FAIL", `got ${errSummary(wrong.error)}`);
}

async function p6(r) {
  const u = await makeUser("p6", { confirmed: false });
  const correct = await anon().auth.signInWithPassword({ email: u.email, password: u.password });
  const wrong = await anon().auth.signInWithPassword({ email: u.email, password: `${u.password}x` });
  const unknown = await anon().auth.signInWithPassword({ email: makeEmail(BASE, RUN, "nobody"), password: u.password });
  r("P6a", "correct password, unverified email: email_not_confirmed", correct.error?.code === "email_not_confirmed" ? "PASS" : "FAIL", `got ${errSummary(correct.error)}`);
  r("P6b", "wrong password, unverified email: does NOT reveal it is unverified", wrong.error?.code === "invalid_credentials" ? "PASS" : "FAIL", `got ${errSummary(wrong.error)}`);
  r("P6c", "unknown address answers like a wrong password", unknown.error?.code === "invalid_credentials" && unknown.error?.status === wrong.error?.status ? "PASS" : "FAIL", `unknown ${errSummary(unknown.error)}, wrong ${errSummary(wrong.error)}`);
}

async function p7(r) {
  if (SKIP_SIGNUP_EMAILS) { r("P7", "skipped (--skip-signup-emails)", "INFO"); return; }
  const existing = await makeUser("p7");
  const fresh = makeEmail(BASE, RUN, "p7new");
  const a = await anon().auth.signUp({ email: fresh, password: randomPassword() });
  if (a.data?.user?.id) created.push(a.data.user.id);
  r("P7a", "a new address signs up without a session (email confirmation is required)", !a.error && a.data.user && !a.data.session ? "PASS" : "FAIL", a.error ? errSummary(a.error) : `session ${a.data.session ? "RETURNED: confirmation is off" : "none"}`);
  r("P7b", "a new address comes back with identities", Array.isArray(a.data?.user?.identities) && a.data.user.identities.length > 0 ? "PASS" : "FAIL", `identities ${a.data?.user?.identities?.length ?? "missing"}`);
  const b = await anon().auth.signUp({ email: existing.email, password: randomPassword() });
  const len = b.data?.user?.identities?.length;
  r("P7c", "an existing address: no error, no session", !b.error && !b.data?.session ? "PASS" : "FAIL", b.error ? errSummary(b.error) : "");
  r("P7d", "an existing address is signalled by an EMPTY identities list (what the adapter reads)", Array.isArray(b.data?.user?.identities) && len === 0 ? "PASS" : "FAIL", `identities ${len ?? "missing"}`);
  r("P7m", `MANUAL: check the inbox of ${BASE.split("@")[1]} for two mails (confirm for ${"p7new"}, and a notice or nothing for the existing address). Does the real owner get told? Reply with what arrived.`, "INFO");
}

async function p8(r) {
  const u = await makeUser("p8");
  const s = await signIn(u.email, u.password);
  r("P8a", "a fresh password sign in is aal1", s.claims.aal === "aal1" ? "PASS" : "FAIL", `aal ${s.claims.aal}`);
  const enr = await s.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "proof-1" });
  if (enr.error) throw enr.error;
  const [factorId, secret] = [enr.data.id, enr.data.totp.secret];
  const pending = await s.client.auth.mfa.listFactors();
  r("P8b", "a factor that was never verified is not in the totp list", pending.data?.totp?.length === 0 ? "PASS" : "FAIL", `listed ${pending.data?.totp?.length}`);
  const good = await freshCode(secret);
  const wrongCode = `${good.slice(0, 5)}${(Number(good[5]) + 1) % 10}`;
  const bad = await s.client.auth.mfa.challengeAndVerify({ factorId, code: wrongCode });
  r("P8c", "a wrong code fails with the code the adapter maps to false", bad.error?.code === "mfa_verification_failed" ? "PASS" : "FAIL", `got ${errSummary(bad.error)}`);
  const ok = await s.client.auth.mfa.challengeAndVerify({ factorId, code: good });
  r("P8d", "the right code verifies", ok.error ? "FAIL" : "PASS", ok.error ? errSummary(ok.error) : "");
  const sess = await s.client.auth.getSession();
  const claims = decodeClaims(sess.data.session.access_token);
  r("P8e", "after verifying, the new token is aal2", claims.aal === "aal2" ? "PASS" : "FAIL", `aal ${claims.aal}`);
  const again = await signIn(u.email, u.password);
  const lvl = await again.client.auth.mfa.getAuthenticatorAssuranceLevel();
  r("P8f", "a new sign in is aal1 again and asks for aal2", again.claims.aal === "aal1" && lvl.data?.nextLevel === "aal2" ? "PASS" : "FAIL", `aal ${again.claims.aal}, next ${lvl.data?.nextLevel}`);
  const lf = await again.client.auth.mfa.listFactors();
  r("P8g", "the verified factor is listed", lf.data?.totp?.length === 1 && lf.data.totp[0].status === "verified" ? "PASS" : "FAIL");
}

async function p9(r) {
  const u = await makeUser("p9");
  const s = await signIn(u.email, u.password);
  const e1 = await s.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "phone" });
  if (e1.error) throw e1.error;
  const v1 = await s.client.auth.mfa.challengeAndVerify({ factorId: e1.data.id, code: await freshCode(e1.data.totp.secret) });
  if (v1.error) throw v1.error;
  const e2 = await s.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "backup" });
  if (e2.error) throw e2.error;
  const v2 = await s.client.auth.mfa.challengeAndVerify({ factorId: e2.data.id, code: await freshCode(e2.data.totp.secret) });
  r("P9a", "a second authenticator can be enrolled and verified", v2.error ? "FAIL" : "PASS", v2.error ? errSummary(v2.error) : "");
  const both = await s.client.auth.mfa.listFactors();
  r("P9b", "both are listed as verified", both.data?.totp?.length === 2 ? "PASS" : "FAIL", `listed ${both.data?.totp?.length}`);
  const gone = await s.client.auth.mfa.unenroll({ factorId: e1.data.id });
  r("P9c", "the first authenticator (the lost phone) can be removed from an aal2 session", gone.error ? "FAIL" : "PASS", gone.error ? errSummary(gone.error) : "");
  const next = await signIn(u.email, u.password);
  const left = await next.client.auth.mfa.listFactors();
  const code = await freshCode(e2.data.totp.secret);
  const rec = await next.client.auth.mfa.challengeAndVerify({ factorId: left.data?.totp?.[0]?.id ?? "none", code });
  const claims = rec.error ? {} : decodeClaims((await next.client.auth.getSession()).data.session.access_token);
  r("P9d", "with the first authenticator gone, the second still reaches aal2 on a new sign in (the recovery plan works)", !rec.error && claims.aal === "aal2" ? "PASS" : "FAIL", rec.error ? errSummary(rec.error) : `aal ${claims.aal}`);
}

async function p10(r) {
  const u = await makeUser("p10");
  const link = await admin.auth.admin.generateLink({ type: "recovery", email: u.email });
  if (link.error) throw link.error;
  const hash = link.data.properties.hashed_token;
  const c = anon();
  const v = await c.auth.verifyOtp({ token_hash: hash, type: "recovery" });
  r("P10a", "the link signs the person in (it creates a session)", !v.error && v.data.session ? "PASS" : "FAIL", v.error ? errSummary(v.error) : "");
  const recoveryToken = v.data?.session?.access_token;
  const newPw = randomPassword();
  const upd = await c.auth.updateUser({ password: newPw });
  r("P10b", "the new password can be set in that session", upd.error ? "FAIL" : "PASS", upd.error ? errSummary(upd.error) : "");
  const oldPw = await anon().auth.signInWithPassword({ email: u.email, password: u.password });
  const nowPw = await anon().auth.signInWithPassword({ email: u.email, password: newPw });
  r("P10c", "old password stops working, new one works", oldPw.error?.code === "invalid_credentials" && !nowPw.error ? "PASS" : "FAIL", `old ${errSummary(oldPw.error)}, new ${errSummary(nowPw.error)}`);
  const reuse = await anon().auth.verifyOtp({ token_hash: hash, type: "recovery" });
  r("P10d", "using the same link again is refused with a client error (the adapter reads 4xx as invalid link)", reuse.error?.status >= 400 && reuse.error?.status < 500 && reuse.error?.status !== 429 ? "PASS" : "FAIL", `got ${errSummary(reuse.error)}`);
  const junk = await anon().auth.verifyOtp({ token_hash: "not-a-real-token", type: "recovery" });
  r("P10e", "a made up link is refused with a client error", junk.error?.status >= 400 && junk.error?.status < 500 && junk.error?.status !== 429 ? "PASS" : "FAIL", `got ${errSummary(junk.error)}`);
  await rpc("revoke_all_sessions", { target_user_id: u.id });
  const dead = recoveryToken ? await live(recoveryToken) : { ok: true };
  r("P10f", "ending every session also ends the session the link created", !dead.ok ? "PASS" : "FAIL");
}

async function p11(r) {
  const u = await makeUser("p11");
  const seed = randomBytes(60).toString("base64url");
  const set = async (password) => (await admin.auth.admin.updateUserById(u.id, { password })).error;
  const p72 = seed.slice(0, 72);
  r("P11a", "a 72 byte password is accepted", !(await set(p72)) ? "PASS" : "FAIL");
  const e73 = await set(seed.slice(0, 73));
  r("P11b", "a 73 byte password is refused by the provider (so our 72 byte limit is the right one)", e73 ? "PASS" : "FAIL", e73 ? errSummary(e73) : "accepted: the limit is higher than 72 bytes, tell AI-2");
  const multibyte = `${"éüöäß".repeat(9)}${seed.slice(0, 5)}`;
  const e85 = await set(multibyte);
  r("P11c", `${[...multibyte].length} characters but ${utf8Length(multibyte)} bytes is refused (the provider counts bytes)`, e85 ? "PASS" : "FAIL", e85 ? errSummary(e85) : "accepted: tell AI-2");
  const short = await set(seed.slice(0, 8));
  r("P11d", "an 8 character password is refused (project minimum is 10)", short ? "PASS" : "TODO", short ? errSummary(short) : "accepted: set the minimum password length to 10 in Authentication settings");
  const pwned = await set("password123456");
  r("P11e", "leaked password protection", "INFO", pwned ? `a well known password was refused (${errSummary(pwned)}): protection looks ON` : "a well known password was accepted: protection is OFF (needs a paid plan, documented as a known limit if unavailable)");
}

async function p12(r) {
  const u = await makeUser("p12");
  const s = await signIn(u.email, u.password);
  const life = s.claims.exp - s.claims.iat;
  r("P12", "access token lifetime is 900 seconds", life === 900 ? "PASS" : "TODO", life === 900 ? "" : `it is ${life}s: set JWT expiry to 900 in Authentication settings`);
}

async function p13(r) {
  const u = await makeUser("p13");
  const c = anon();
  const first = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  const second = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  const [a, b] = [decodeClaims(first.data.session.access_token).session_id, decodeClaims(second.data.session.access_token).session_id];
  r("P13", "signing in again on the same client gives a different session id", a && b && a !== b ? "PASS" : "FAIL");
}

// ---------- run ----------
async function cleanup() {
  let failed = 0;
  for (const id of created.splice(0)) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) { failed += 1; out(`      cleanup could not delete user ${id}: ${errSummary(error)}`); }
  }
  out(failed ? `Cleanup: ${failed} throwaway user(s) left. Their emails contain gg-proof-${RUN}; delete them in the dashboard.` : "Cleanup: every throwaway user deleted.");
}

let interrupted = false;
process.on("SIGINT", async () => { if (interrupted) process.exit(130); interrupted = true; out("\nInterrupted. Cleaning up..."); await cleanup(); process.exit(130); });

out(`Proof run ${RUN} against ${host}`);
out("Throwaway users: " + BASE.split("@")[0] + `+gg-proof-${RUN}-*@` + BASE.split("@")[1]);
out("");
try {
  for (const [id, title, fn] of selected) {
    out(`-- ${id}: ${title}`);
    try {
      await fn((sub, t, status, detail) => report(sub, t, status, detail));
    } catch (e) {
      report(id, `${title} stopped early`, "FAIL", `${errSummary(e)} (an unexpected response, not a verdict: send this line to AI-2)`);
    }
  }
} finally {
  out("");
  await cleanup();
}
const count = (s) => results.filter((x) => x.status === s).length;
out(`\nSummary: ${count("PASS")} PASS, ${count("FAIL")} FAIL, ${count("TODO")} TODO, ${count("INFO")} INFO`);
process.exit(count("FAIL") ? 1 : 0);
