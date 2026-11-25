import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { GenerateRequest } from "@/lib/schema";
import { generateScript, GenerationRefused, MissingApiKey } from "@/lib/generate";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = GenerateRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const script = await generateScript(parsed.data);
    return NextResponse.json({ script });
  } catch (error) {
    if (error instanceof GenerationRefused) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Busy right now. Try again in a minute." }, { status: 429 });
    }
    if (error instanceof MissingApiKey || error instanceof Anthropic.AuthenticationError) {
      console.error("Claude API authentication failed:", error.message);
      return NextResponse.json({ error: "The server isn't set up with a Claude API key yet." }, { status: 500 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}`, error.message);
      return NextResponse.json({ error: "Script generation failed. Try again." }, { status: 502 });
    }
    console.error(error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
