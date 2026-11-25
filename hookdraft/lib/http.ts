import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { GenerationRefused, MissingApiKey } from "./generate";

// Parses and validates a JSON body; returns either the data or a ready-made 400 response.
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: NextResponse.json({ error: "Request body must be JSON." }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { response: NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 }) };
  }
  return { data: parsed.data };
}

export function errorResponse(error: unknown): NextResponse {
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
