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
- The same goes for claims about results and about the creator: don't state outcomes ("nothing gets wasted", "it doubled my sales"), feelings ("the hardest part of my day") or opinions they didn't express. Hooks, on-screen text and the caption follow this rule too. If a line needs one, write it as a placeholder, e.g. [how you feel about closing time].
- On-screen text is a short overlay that reinforces the line, readable in under a second.
- Scene timings must start at 0 and end exactly at the requested length, with no gaps.
- The caption reads like the creator wrote it and works as search text. Do not add a wall of hashtags.
- End with one clear call to action that fits the video (follow for part 2, comment a word, save it).`;

// HOOKDRAFT_ANTHROPIC_API_KEY takes priority: some hosts (including Claude Code cloud sessions)
// don't pass ANTHROPIC_API_KEY through to the app. Leaving both unset falls back to the SDK's defaults.
const client = new Anthropic({ apiKey: process.env.HOOKDRAFT_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || undefined });

export class GenerationRefused extends Error {}
export class MissingApiKey extends Error {}

export async function generateScript(req: GenerateRequest): Promise<Script> {
  if (process.env.HOOKDRAFT_MOCK === "1") return SAMPLE_SCRIPT;

  const response = await client.beta.messages
    .parse({
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
    })
    .catch((error: unknown) => {
      // The SDK throws a plain Error, before any request is sent, when no key or login is configured.
      if (error instanceof Error && error.message.startsWith("Could not resolve authentication method")) {
        throw new MissingApiKey(error.message);
      }
      throw error;
    });

  if (response.stop_reason === "refusal") {
    throw new GenerationRefused("This idea couldn't be scripted. Try rewording it.");
  }
  if (!response.parsed_output) {
    throw new Error(`Script came back incomplete (stop reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}
