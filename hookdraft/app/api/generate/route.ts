import { NextResponse } from "next/server";
import { GenerateRequest } from "@/lib/schema";
import { generateScript } from "@/lib/generate";
import { errorResponse, readBody } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await readBody(request, GenerateRequest);
  if ("response" in body) return body.response;
  try {
    return NextResponse.json({ script: await generateScript(body.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
