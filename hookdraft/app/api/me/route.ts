import { NextResponse } from "next/server";
import { FREE_SCRIPTS, loadAccount, MONTHLY_LIMIT, UNITS } from "@/lib/billing";
import { accountsConfigured, currentUser } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the page needs to show the quota, sign-in state and paywall.
export async function GET() {
  if (!accountsConfigured) return NextResponse.json({ accounts: false });
  const user = await currentUser();
  if (!user) return NextResponse.json({ accounts: true, signedIn: false, freeScripts: FREE_SCRIPTS });
  const a = await loadAccount(user.id, user.email ?? null);
  return NextResponse.json({
    accounts: true,
    signedIn: true,
    email: a.email,
    plan: a.plan,
    subscribed: a.subscribed,
    used: a.used,
    limit: a.limit,
    monthlyLimit: MONTHLY_LIMIT,
    variationUnits: UNITS.variations,
  });
}
