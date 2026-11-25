import { NextResponse } from "next/server";
import { GenerateRequest } from "@/lib/schema";
import { generateScript } from "@/lib/generate";
import { checkAllowance, recordUsage } from "@/lib/billing";
import { errorResponse, readBody } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await readBody(request, GenerateRequest);
  if ("response" in body) return body.response;
  const gate = await checkAllowance("script");
  if (!gate.ok) return gate.response;
  try {
    const script = await generateScript(body.data);
    await recordUsage(gate.userId, "script");
    return NextResponse.json({ script });
  } catch (error) {
    return errorResponse(error);
  }
}
