import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Script, Variation, type GenerateRequest, type VariationsRequest } from "./schema";
import { SAMPLE_SCRIPT } from "./sample";

const SYSTEM_PROMPT = `You write short-form video scripts for creators on Instagram Reels, TikTok and YouTube Shorts.

The creator gives you a rough idea. Turn it into a script they can film today.

What makes these videos work:
- The first 1-3 seconds decide everything. Each hook must make a specific promise or open a specific question, in plain spoken words, under 12 words. No "Hey guys", no throat-clearing.
- Write the three hooks in three genuinely different styles (for example bold claim, curiosity gap, contrarian, relatable pain, result-first). Hook 1 is your strongest.
- Every scene should earn the next one: deliver a payoff or raise a new question. Cut anything that doesn't.
- Write voiceover the way people talk: short sentences, contractions, concrete details from the creator's idea.
- Two kinds of content, two rules:
  - Claims about the creator (their results, numbers, credentials, experiences, feelings, opinions, or what their business actually does) must come from the idea. If a line needs one the creator didn't give, write a short [bracketed placeholder], e.g. [your revenue last month], [where the leftover bread goes]. Never state an outcome like "nothing gets wasted" or "it doubled my sales" on their behalf.
  - General know-how about the topic (common mistakes, how a technique works, widely known tips) you may write out in full, so the script has real substance the creator can check before filming. Don't put a placeholder where solid general advice would do.
- Never put a placeholder in a hook. If the strongest hook would need a number or credential the creator didn't give, pick a different angle.
- For list videos (tips, mistakes, steps): number the items out loud, tease the best one early ("number 3 is the one nobody talks about") so people stay to the end. When it fits, the last item or the close can be "if you only try one, do this".
- On-screen text is a short overlay that reinforces the line, readable in under a second.
- Scene timings must start at 0 and end exactly at the requested length, with no gaps.
- The caption reads like the creator wrote it and works as search text. Do not add a wall of hashtags.
- If the creator names a niche, write for that audience (their words, their problems). If they pick a tone, write the whole script in it.
- End with one clear call to action that fits the video (follow for part 2, comment a word, save it).`;

// HOOKDRAFT_ANTHROPIC_API_KEY takes priority: some hosts (including Claude Code cloud sessions)
// don't pass ANTHROPIC_API_KEY through to the app. Leaving both unset falls back to the SDK's defaults.
const client = new Anthropic({ apiKey: process.env.HOOKDRAFT_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || undefined });

export class GenerationRefused extends Error {}
export class MissingApiKey extends Error {}

export async function generateScript(req: GenerateRequest): Promise<Script> {
  if (process.env.HOOKDRAFT_MOCK === "1") return SAMPLE_SCRIPT;
  return callClaude(Script, briefFor(req));
}

function briefFor(req: GenerateRequest): string {
  const extras = [req.niche && `Niche: ${req.niche}`, req.tone && `Tone: ${req.tone}`].filter(Boolean).join("\n");
  return `Platform: ${req.platform}\nLength: ${req.lengthSeconds} seconds${extras ? `\n${extras}` : ""}\n\nMy idea:\n${req.idea}`;
}

// Each variation gets its own angle so the three don't come back as near-copies of each other.
const VARIATION_ANGLES = [
  "New opening: three new hooks in different styles from the original's, and a different first scene. The body can stay close to the original.",
  "Same points, new framing: change the order (for example lead with the payoff or the most surprising point), reword every line, and use a different call to action.",
  "Different format: tell it as a POV, a story, a myth-vs-fact, or a before-and-after (whichever suits the idea and is furthest from the original's format).",
];

export async function generateVariations(req: VariationsRequest): Promise<Variation[]> {
  if (process.env.HOOKDRAFT_MOCK === "1") {
    return VARIATION_ANGLES.map((_, i) => ({ ...SAMPLE_SCRIPT, changed: `Sample variation ${i + 1}.` }));
  }
  const base = `${briefFor(req)}\n\nThis script already worked for me:\n${JSON.stringify(req.script)}\n\n`;
  const results = await Promise.allSettled(
    VARIATION_ANGLES.map((angle, i) =>
      callClaude(
        Variation,
        base +
          `Write a variation of that script I can post as a new video. Keep the core idea, every fact, and every [placeholder] from the original; don't add new claims about me. It must feel fresh to someone who saw the original: new hook lines, reworded voiceover, new on-screen text and a new caption.\n\nWhat to change: ${angle}\n\nTwo other variations are being written separately with these briefs, so don't open the way they would or reuse their framing:\n${VARIATION_ANGLES.filter((_, j) => j !== i).map((a) => `- ${a}`).join("\n")}`,
      ),
    ),
  );
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (ok.length === 0) throw (results[0] as PromiseRejectedResult).reason;
  return ok;
}

async function callClaude<T extends typeof Script | typeof Variation>(schema: T, userMessage: string) {
  const response = await client.beta.messages
    .parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
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
  return response.parsed_output as z.infer<T>;
}
