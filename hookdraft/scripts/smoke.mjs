// Generates real scripts for a few ideas against a running server and checks their shape.
// Usage: npm run dev (without HOOKDRAFT_MOCK), then: node scripts/smoke.mjs [baseUrl]
const base = process.argv[2] ?? "http://localhost:3100";

const IDEAS = [
  { platform: "TikTok", lengthSeconds: 30, idea: "How I meal prep a week of lunches for under $30" },
  { platform: "Instagram Reels", lengthSeconds: 15, idea: "3 posture mistakes I see every day as a physical therapist at a desk job clinic" },
  { platform: "YouTube Shorts", lengthSeconds: 60, idea: "I tested every free AI note-taker for a month. Which one actually saved me time" },
  { platform: "Instagram Reels", lengthSeconds: 30, idea: "Small bakery owner: what happens to the unsold bread at closing time" },
];

function problems(script, length) {
  const out = [];
  if (script.hooks?.length !== 3) out.push(`expected 3 hooks, got ${script.hooks?.length}`);
  const scenes = script.scenes ?? [];
  if (!scenes.length) out.push("no scenes");
  if (scenes[0] && scenes[0].start !== 0) out.push(`first scene starts at ${scenes[0].start}`);
  scenes.forEach((s, i) => {
    if (s.end <= s.start) out.push(`scene ${i + 1} ends before it starts`);
    if (i > 0 && s.start !== scenes[i - 1].end) out.push(`gap/overlap before scene ${i + 1}`);
  });
  const last = scenes.at(-1);
  if (last && last.end !== length) out.push(`last scene ends at ${last.end}, not ${length}`);
  if (scenes[0] && script.hooks?.[0] && !scenes[0].voiceover.includes(script.hooks[0].line)) out.push("scene 1 doesn't use hook 1");
  return out;
}

let failed = 0;
let firstOk = null;
for (const req of IDEAS) {
  const t = Date.now();
  const res = await fetch(`${base}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  const data = await res.json().catch(() => ({}));
  console.log(`\n=== ${req.platform} · ${req.lengthSeconds}s · ${req.idea}  (${res.status}, ${((Date.now() - t) / 1000).toFixed(1)}s)`);
  if (!res.ok) { failed++; console.log("ERROR:", data.error); continue; }
  const s = data.script;
  s.hooks.forEach((h, i) => console.log(`Hook ${i + 1} [${h.style}]: ${h.line}`));
  s.scenes.forEach((sc) => console.log(`  ${sc.start}-${sc.end}s | ${sc.shot}\n      Say: ${sc.voiceover}${sc.onScreenText ? `\n      Text: ${sc.onScreenText}` : ""}`));
  console.log(`Caption: ${s.caption}\nCTA: ${s.cta}`);
  const p = problems(s, req.lengthSeconds);
  if (p.length) { failed++; console.log("PROBLEMS:", p.join("; ")); } else console.log("OK");
  firstOk ??= { req, script: s };
}

// Variations of the first script that worked: each must be a valid script of the same length.
if (firstOk) {
  const t = Date.now();
  const res = await fetch(`${base}/api/variations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...firstOk.req, script: firstOk.script }) });
  const data = await res.json().catch(() => ({}));
  console.log(`\n=== Variations of: ${firstOk.req.idea}  (${res.status}, ${((Date.now() - t) / 1000).toFixed(1)}s)`);
  if (!res.ok) { failed++; console.log("ERROR:", data.error); }
  else {
    if (data.variations.length !== 3) { failed++; console.log(`PROBLEMS: expected 3 variations, got ${data.variations.length}`); }
    data.variations.forEach((v, i) => {
      const p = problems(v, firstOk.req.lengthSeconds);
      if (!v.changed) p.push("missing 'changed' note");
      console.log(`Variation ${i + 1}: ${v.changed}\n  Hook 1: ${v.hooks[0]?.line}\n  ${p.length ? "PROBLEMS: " + p.join("; ") : "OK"}`);
      if (p.length) failed++;
    });
  }
}
process.exit(failed ? 1 : 0);
