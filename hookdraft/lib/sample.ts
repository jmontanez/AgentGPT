import type { Script } from "./schema";

// Returned when HOOKDRAFT_MOCK=1, so the UI can be built and demoed without API calls.
export const SAMPLE_SCRIPT: Script = {
  hooks: [
    { style: "Bold claim", line: "Quitting my job was the easy part.", why: "Flips the expected story and makes viewers ask what the hard part is." },
    { style: "Curiosity gap", line: "Nobody warned me about day 3.", why: "Names a specific moment without explaining it, so people stay to find out." },
    { style: "Contrarian", line: "Don't quit your 9–5 until you see this.", why: "Speaks directly to anyone thinking about quitting and promises a warning." },
  ],
  scenes: [
    { start: 0, end: 3, shot: "Close-up, straight to camera", voiceover: "Quitting my job was the easy part.", onScreenText: "Week 1 after quitting" },
    { start: 3, end: 12, shot: "B-roll: messy desk, cold coffee, empty calendar", voiceover: "No boss. No schedule. And by day 3 I had no idea what I was doing.", onScreenText: "No boss. No schedule." },
    { start: 12, end: 25, shot: "Talking head, slight push-in", voiceover: "Three things nobody tells you: you'll work more, not less. Your phone becomes your boss. And [your biggest surprise].", onScreenText: "3 things nobody says" },
    { start: 25, end: 30, shot: "Back to close-up", voiceover: "Week 2 is where it got real. Follow so you don't miss it.", onScreenText: "Follow for week 2" },
  ],
  caption: "Week one after quitting my 9–5. Save this if you're thinking about doing it.",
  cta: "Follow for week 2.",
};
