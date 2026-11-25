import { NextResponse } from "next/server";
import { accountsConfigured, currentUser, supabaseAdmin } from "./supabase";

// Pricing decisions live in PRICING.md; these are the numbers the server enforces.
export const FREE_SCRIPTS = 1; // lifetime, before subscribing
export const MONTHLY_LIMIT = 100; // fair use for subscribers, per calendar month (UTC)
export const UNITS = { script: 1, variations: 3 } as const; // a round of 3 variations counts as 3
export const RATE_LIMIT_PER_MINUTE = 6;

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

type Gate = { ok: true; userId: string | null } | { ok: false; response: NextResponse };

// Run before calling Claude: signed in, under the limit for this kind of request, not hammering.
export async function checkAllowance(kind: UsageKind): Promise<Gate> {
  if (!accountsConfigured) {
    if (process.env.NODE_ENV === "production" && process.env.HOOKDRAFT_MOCK !== "1") {
      console.error("Supabase settings are missing; refusing to serve unmetered scripts in production.");
      return { ok: false, response: NextResponse.json({ error: "The server isn't fully set up yet." }, { status: 500 }) };
    }
    return { ok: true, userId: null }; // local development without accounts
  }

  const user = await currentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Sign in to write your script.", code: "signin" }, { status: 401 }) };
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
  return { ok: true, userId: user.id };
}

// Run after a successful generation, so failed requests don't count.
export async function recordUsage(userId: string | null, kind: UsageKind) {
  if (!userId) return;
  const { error } = await supabaseAdmin().from("usage").insert({ user_id: userId, kind, units: UNITS[kind] });
  if (error) console.error("Couldn't record usage", error.message);
}
