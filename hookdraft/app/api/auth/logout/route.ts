import { NextResponse } from "next/server";
import { accountsConfigured, supabaseForRequest } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  if (accountsConfigured) await (await supabaseForRequest()).auth.signOut();
  return NextResponse.json({ ok: true });
}
