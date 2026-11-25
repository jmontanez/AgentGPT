import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAllowance, recordUsage } from "@/lib/billing";
import { errorResponse, readBody } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const ClaimRequest = z.object({ id: z.uuid() });
const CLAIM_WINDOW_MS = 24 * 60 * 60_000;

// After signing in, unlock the script that was started before sign-in. Counts as one script.
export async function POST(request: Request) {
  const body = await readBody(request, ClaimRequest);
  if ("response" in body) return body.response;
  const gate = await checkAllowance("script", request);
  if (!gate.ok) return gate.response;
  if (gate.anonymous || !gate.userId) {
    return NextResponse.json({ error: "Sign in first.", code: "signin" }, { status: 401 });
  }
  try {
    const db = supabaseAdmin();
    // Claim atomically: only an unclaimed script from the last 24 hours, and only once.
    const { data, error } = await db
      .from("pending_scripts")
      .update({ claimed_by: gate.userId, claimed_at: new Date().toISOString() })
      .eq("id", body.data.id)
      .is("claimed_by", null)
      .gte("created_at", new Date(Date.now() - CLAIM_WINDOW_MS).toISOString())
      .select("request, script")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "That script has expired. Generate a new one." }, { status: 410 });
    await recordUsage(gate.userId, "script");
    return NextResponse.json({ script: data.script, request: data.request });
  } catch (error) {
    return errorResponse(error);
  }
}
