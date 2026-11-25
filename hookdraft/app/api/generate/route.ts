import { NextResponse } from "next/server";
import { GenerateRequest } from "@/lib/schema";
import { generateScript } from "@/lib/generate";
import { checkAllowance, recordUsage } from "@/lib/billing";
import { errorResponse, readBody } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await readBody(request, GenerateRequest);
  if ("response" in body) return body.response;
  const gate = await checkAllowance("script", request);
  if (!gate.ok) return gate.response;
  try {
    const script = await generateScript(body.data);

    if (gate.anonymous) {
      // Not signed in: keep the full script on the server and show only the hooks.
      // Signing in claims it via /api/claim, which uses the free script.
      const { data, error } = await supabaseAdmin()
        .from("pending_scripts")
        .insert({ request: body.data, script, ip_hash: gate.ipHash })
        .select("id")
        .single();
      if (error) throw error;
      return NextResponse.json({ preview: { hooks: script.hooks, sceneCount: script.scenes.length }, pendingId: data.id });
    }

    await recordUsage(gate.userId, "script");
    return NextResponse.json({ script });
  } catch (error) {
    return errorResponse(error);
  }
}
