import { NextResponse } from "next/server";
import { VariationsRequest } from "@/lib/schema";
import { generateVariations } from "@/lib/generate";
import { checkAllowance, recordUsage } from "@/lib/billing";
import { errorResponse, readBody } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await readBody(request, VariationsRequest);
  if ("response" in body) return body.response;
  const gate = await checkAllowance("variations");
  if (!gate.ok) return gate.response;
  try {
    const variations = await generateVariations(body.data);
    await recordUsage(gate.userId, "variations");
    return NextResponse.json({ variations });
  } catch (error) {
    return errorResponse(error);
  }
}
