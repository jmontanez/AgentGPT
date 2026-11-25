// End-to-end check of sign-in, limits and the before-sign-in flow against the real Supabase project.
// Creates a throwaway user (deleted at the end) and makes 5 real Claude calls (~$0.25).
//
// Needs the dev server running WITH accounts on:
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SECRET_KEY=... npm run dev
// then, with the same three variables set:
//   node scripts/e2e-accounts.mjs [baseUrl]
import { createHash } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishable || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.");
  process.exit(2);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now();
const testIp = `203.0.113.${run % 250}`; // documentation range, never a real visitor
const ipHash = createHash("sha256").update(`${testIp}|${secret}`).digest("hex");
const idea = { idea: "How I meal prep a week of lunches for under $30", platform: "TikTok", lengthSeconds: 15, niche: "Food" };

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

let cookieHeader = "";
const call = async (method, path, body, { ip = testIp } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(cookieHeader ? { cookie: cookieHeader } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

let userId = null;
try {
  // 1. Not signed in: generate shows hooks only and parks the script on the server.
  const me0 = await call("GET", "/api/me");
  check("signed out: /api/me", me0.data.accounts === true && me0.data.signedIn === false, JSON.stringify(me0.data));
  const anon = await call("POST", "/api/generate", idea);
  check("signed out: generate returns a preview, not the script", anon.status === 200 && anon.data.preview?.hooks?.length === 3 && !anon.data.script && anon.data.pendingId, `status ${anon.status} ${anon.data.error ?? ""}`);
  const pendingId = anon.data.pendingId;
  const vary0 = await call("POST", "/api/variations", { ...idea, script: { hooks: [], scenes: [], caption: "", cta: "" } });
  check("signed out: variations need sign-in", vary0.status === 401 || vary0.status === 400, `status ${vary0.status}`);

  // 2. Sign in as a fresh user (password sign-in stands in for the email link here).
  const email = `hookdraft-e2e-${run}@example.com`;
  const password = `e2e-${run}-${Math.random().toString(36).slice(2)}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const { data: profile } = await admin.from("profiles").select("plan").eq("user_id", userId).maybeSingle();
  check("sign-up trigger created a free profile", profile?.plan === "free", JSON.stringify(profile));

  const jar = new Map();
  const ssr = createServerClient(url, publishable, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const signIn = await ssr.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  cookieHeader = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");

  const me1 = await call("GET", "/api/me");
  check("signed in: free plan, 0 of 1 used", me1.data.signedIn && me1.data.plan === "free" && me1.data.used === 0 && me1.data.limit === 1, JSON.stringify(me1.data));

  // 3. Claim the script made before sign-in. Uses the free script; works once.
  const claim = await call("POST", "/api/claim", { id: pendingId });
  check("claim unlocks the full script", claim.status === 200 && claim.data.script?.scenes?.length > 0, `status ${claim.status} ${claim.data.error ?? ""}`);
  const claimAgain = await call("POST", "/api/claim", { id: pendingId });
  check("a script can't be claimed twice", claimAgain.status === 402 || claimAgain.status === 410, `status ${claimAgain.status}`);
  const me2 = await call("GET", "/api/me");
  check("free script is now used", me2.data.used === 1, `used ${me2.data.used}`);

  // 4. Free script used: paywall for scripts and variations.
  const gen2 = await call("POST", "/api/generate", idea);
  check("free user: second script hits the paywall", gen2.status === 402 && gen2.data.code === "upgrade", `status ${gen2.status}`);
  const vary1 = await call("POST", "/api/variations", { ...idea, script: claim.data.script });
  check("free user: variations hit the paywall", vary1.status === 402 && vary1.data.code === "upgrade", `status ${vary1.status}`);

  // 5. Subscribed (what the Stripe webhook would set): scripts and variations work and are counted.
  await admin.from("profiles").update({ plan: "active" }).eq("user_id", userId);
  const me3 = await call("GET", "/api/me");
  check("subscriber: 100 a month", me3.data.subscribed && me3.data.limit === 100, JSON.stringify(me3.data));
  const gen3 = await call("POST", "/api/generate", idea);
  check("subscriber: generate works", gen3.status === 200 && gen3.data.script, `status ${gen3.status} ${gen3.data.error ?? ""}`);
  const vary2 = await call("POST", "/api/variations", { ...idea, script: gen3.data.script });
  check("subscriber: variations work", vary2.status === 200 && vary2.data.variations?.length === 3, `status ${vary2.status} ${vary2.data.error ?? ""}`);
  const me4 = await call("GET", "/api/me");
  check("usage counted (1 free + 1 script + 3 for variations = 5)", me4.data.used === 5, `used ${me4.data.used}`);

  // 6. Rate limit: 6 generations in a minute, then 429. (Pad with rows instead of real calls.)
  await admin.from("usage").insert(Array.from({ length: 6 }, () => ({ user_id: userId, kind: "script", units: 1 })));
  const gen4 = await call("POST", "/api/generate", idea);
  check("rate limit after 6 in a minute", gen4.status === 429, `status ${gen4.status}`);

  // 7. Monthly cap: 100 units used, then a variations round (3 units) is refused.
  await admin.from("usage").delete().eq("user_id", userId);
  await admin.from("usage").insert({ user_id: userId, kind: "script", units: 99, created_at: new Date(Date.now() - 5 * 60_000).toISOString() });
  const vary3 = await call("POST", "/api/variations", { ...idea, script: gen3.data.script });
  check("monthly cap: variations refused with 1 left", vary3.status === 402 && vary3.data.code === "limit", `status ${vary3.status} ${vary3.data.error ?? ""}`);

  // 8. Unsigned scripts are capped per connection per day.
  cookieHeader = "";
  await admin.from("pending_scripts").insert([1, 2].map(() => ({ request: idea, script: {}, ip_hash: ipHash })));
  const anon4 = await call("POST", "/api/generate", idea);
  check("4th unsigned script from one connection asks for sign-in", anon4.status === 401 && anon4.data.code === "signin", `status ${anon4.status}`);
} catch (error) {
  failed++;
  console.error("ERROR", error);
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("pending_scripts").delete().eq("ip_hash", ipHash);
  console.log(userId ? "Cleaned up the test user and its rows." : "Cleaned up test rows.");
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
