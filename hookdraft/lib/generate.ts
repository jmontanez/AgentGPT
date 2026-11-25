import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Script, type GenerateRequest } from "./schema";
import { SAMPLE_SCRIPT } from "./sample";

const SYSTEM_PROMPT = `You write short-form video scripts for creators on Instagram Reels, TikTok and YouTube Shorts.

The creator gives you a rough idea. Turn it into a script they can film today.

What makes these videos work:
- The first 1-3 seconds decide everything. Each hook must make a specific promise or open a specific question, in plain spoken words, under 12 words. No "Hey guys", no throat-clearing.
- Write the three hooks in three genuinely different styles (for example bold claim, curiosity gap, contrarian, relatable pain, result-first). Hook 1 is your strongest.
- Every scene should earn the next one: deliver a payoff or raise a new question. Cut anything that doesn't.
- Write voiceover the way people talk: short sentences, contractions, concrete details from the creator's idea. Never invent facts, numbers or credentials the creator didn't give; use a [bracketed placeholder] instead.
- On-screen text is a short overlay that reinforces the line, readable in under a second.
- Scene timings must start at 0 and end exactly at the requested length, with no gaps.
- The caption reads like the creator wrote it and works as search text. Do not add a wall of hashtags.
- End with one clear call to action that fits the video (follow for part 2, comment a word, save it).`;

const client = new Anthropic();

export class GenerationRefused extends Error {}
export class MissingCredentials extends Error {}

// The SDK throws a plain Error (not an APIError) when it finds no API key, auth token or
// `ant auth login` profile, before any request is sent. There is no typed class for it.
function isMissingCredentials(error: unknown): boolean {
  return (
    error instanceof Error &&
    !(error instanceof Anthropic.APIError) &&
    error.message.startsWith("Could not resolve authentication method")
  );
}

export async function generateScript(req: GenerateRequest): Promise<Script> {
  if (process.env.HOOKDRAFT_MOCK === "1") return SAMPLE_SCRIPT;

  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Script) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Platform: ${req.platform}\nLength: ${req.lengthSeconds} seconds\n\nMy idea:\n${req.idea}`,
        },
      ],
    });
  } catch (error) {
    if (isMissingCredentials(error)) throw new MissingCredentials("No Claude API key is configured.");
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new GenerationRefused("This idea couldn't be scripted. Try rewording it.");
  }
  if (!response.parsed_output) {
    throw new Error(`Script came back incomplete (stop reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}
