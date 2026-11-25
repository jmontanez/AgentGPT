import { z } from "zod";

export const PLATFORMS = ["Instagram Reels", "TikTok", "YouTube Shorts"] as const;
export const LENGTHS = [15, 30, 60] as const;
export const NICHES = ["Fitness", "Food", "Business", "Beauty", "Tech", "Education", "Lifestyle", "Local business"] as const;
export const TONES = ["Funny", "Educational", "Storytelling", "Bold"] as const;

export const GenerateRequest = z.object({
  idea: z.string().trim().min(10, "Give a little more detail (10+ characters).").max(2000),
  platform: z.enum(PLATFORMS),
  lengthSeconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  // Optional answers that tune the script to the creator's audience and voice.
  niche: z.enum(NICHES).optional(),
  tone: z.enum(TONES).optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

export const Script = z.object({
  hooks: z
    .array(
      z.object({
        style: z.string().describe("Short label, e.g. Bold claim, Curiosity gap, Contrarian"),
        line: z.string().describe("The exact first line to say on camera"),
        why: z.string().describe("One sentence on why this stops the scroll"),
      }),
    )
    .describe("Exactly 3 hooks, each a different style"),
  scenes: z
    .array(
      z.object({
        start: z.number().describe("Start second"),
        end: z.number().describe("End second"),
        shot: z.string().describe("What the camera shows"),
        voiceover: z.string().describe("What the creator says"),
        onScreenText: z.string().describe("Short text overlay, or empty string"),
      }),
    )
    .describe("Scenes in order, covering the full length; scene 1 uses hook 1"),
  caption: z.string().describe("Post caption, 1-3 sentences, keyword-rich, no hashtag wall"),
  cta: z.string().describe("The closing call to action"),
});
export type Script = z.infer<typeof Script>;

export const Variation = Script.extend({
  changed: z.string().describe("One short sentence telling the creator what's different from the original"),
});
export type Variation = z.infer<typeof Variation>;

export const VariationsRequest = GenerateRequest.extend({ script: Script });
export type VariationsRequest = z.infer<typeof VariationsRequest>;
