import { NextResponse } from "next/server";
import { VariationsRequest } from "@/lib/schema";
import { generateVariations } from "@/lib/generate";
import { errorResponse, readBody } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await readBody(request, VariationsRequest);
  if ("response" in body) return body.response;
  try {
    return NextResponse.json({ variations: await generateVariations(body.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
