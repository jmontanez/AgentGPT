import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { accountsConfigured, currentUser, supabaseAdmin } from "./supabase";

// Pricing decisions live in PRICING.md; these are the numbers the server enforces.
export const FREE_SCRIPTS = 1; // lifetime, before subscribing
export const MONTHLY_LIMIT = 100; // fair use for subscribers, per calendar month (UTC)
export const UNITS = { script: 1, variations: 3 } as const; // a round of 3 variations counts as 3
export const RATE_LIMIT_PER_MINUTE = 6;
// Visitors can start a script before signing in (the full script unlocks after sign-in).
// This caps how many each connection can start per day, since each one costs an API call.
export const ANON_SCRIPTS_PER_DAY = 3;

export type UsageKind = keyof typeof UNITS;
const PAID_PLANS = new Set(["trialing", "active"]);

export type Account = {
  userId: string;
  email: string | null;
  plan: string;
  subscribed: boolean;
  used: number; // free: lifetime units; subscribed: this month's units
  limit: number;
};

function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function loadAccount(userId: string, email: string | null): Promise<Account> {
  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("plan").eq("user_id", userId).maybeSingle();
  const plan = profile?.plan ?? "free";
  const subscribed = PAID_PLANS.has(plan);

  let query = db.from("usage").select("units").eq("user_id", userId);
  if (subscribed) query = query.gte("created_at", startOfMonthUtc());
  const { data: rows, error } = await query;
  if (error) throw error;
  const used = (rows ?? []).reduce((sum, r) => sum + r.units, 0);

  return { userId, email, plan, subscribed, used, limit: subscribed ? MONTHLY_LIMIT : FREE_SCRIPTS };
}

type Gate =
  | { ok: true; userId: string | null; anonymous: false }
  | { ok: true; userId: null; anonymous: true; ipHash: string }
  | { ok: false; response: NextResponse };

// Salted so the stored value can't be turned back into an address.
export function ipHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ip}|${process.env.SUPABASE_SECRET_KEY ?? ""}`).digest("hex");
}

// Run before calling Claude: signed in (or an unsigned first script), under the limit, not hammering.
export async function checkAllowance(kind: UsageKind, request: Request): Promise<Gate> {
  if (!accountsConfigured) {
    if (process.env.NODE_ENV === "production" && process.env.HOOKDRAFT_MOCK !== "1") {
      console.error("Supabase settings are missing; refusing to serve unmetered scripts in production.");
      return { ok: false, response: NextResponse.json({ error: "The server isn't fully set up yet." }, { status: 500 }) };
    }
    return { ok: true, userId: null, anonymous: false }; // local development without accounts
  }

  const user = await currentUser();
  if (!user) {
    if (kind !== "script") {
      return { ok: false, response: NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 }) };
    }
    const hash = ipHash(request);
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { count } = await supabaseAdmin().from("pending_scripts").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", since);
    if ((count ?? 0) >= ANON_SCRIPTS_PER_DAY) {
      return { ok: false, response: NextResponse.json({ error: "Sign in to keep writing.", code: "signin" }, { status: 401 }) };
    }
    return { ok: true, userId: null, anonymous: true, ipHash: hash };
  }

  const db = supabaseAdmin();
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("usage").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, response: NextResponse.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 }) };
  }

  const account = await loadAccount(user.id, user.email ?? null);
  if (account.used + UNITS[kind] > account.limit) {
    const error = account.subscribed
      ? kind === "variations" && account.used < account.limit
        ? `Variations count as 3 scripts and you have ${account.limit - account.used} left this month.`
        : "You've reached this month's 100 scripts. Your count resets on the 1st."
      : kind === "variations"
        ? "Variations are part of the paid plan."
        : "You've used your free script.";
    return { ok: false, response: NextResponse.json({ error, code: account.subscribed ? "limit" : "upgrade" }, { status: 402 }) };
  }
  return { ok: true, userId: user.id, anonymous: false };
}

// Run after a successful generation, so failed requests don't count.
export async function recordUsage(userId: string | null, kind: UsageKind) {
  if (!userId) return;
  const { error } = await supabaseAdmin().from("usage").insert({ user_id: userId, kind, units: UNITS[kind] });
  if (error) console.error("Couldn't record usage", error.message);
}
