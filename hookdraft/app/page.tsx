"use client";

import { useEffect, useState } from "react";
import { LENGTHS, PLATFORMS, type Script } from "@/lib/schema";
import { SAMPLE_SCRIPT } from "@/lib/sample";

// One free script to show what HookDraft does, then the upgrade link.
const FREE_SCRIPTS = 1;
const USED_KEY = "hookdraft.used";
const PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;

type Platform = (typeof PLATFORMS)[number];
type Length = (typeof LENGTHS)[number];

// One tap fills the form, so a first-time visitor gets to a real script without having to think of an idea.
const EXAMPLE_IDEAS: { label: string; idea: string; platform: Platform; lengthSeconds: Length }[] = [
  { label: "Meal prep on a budget", idea: "How I meal prep a week of lunches for under $30", platform: "TikTok", lengthSeconds: 30 },
  { label: "Desk posture mistakes", idea: "3 posture mistakes I see every day as a physical therapist, from people who work at a desk", platform: "Instagram Reels", lengthSeconds: 30 },
  { label: "Behind the counter", idea: "Small bakery owner: what happens to the unsold bread at closing time", platform: "YouTube Shorts", lengthSeconds: 30 },
];

function readUsed(): number {
  try {
    return Number(localStorage.getItem(USED_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeUsed(n: number) {
  try {
    localStorage.setItem(USED_KEY, String(n));
  } catch {
    // Storage blocked: the counter just won't persist.
  }
}

// Scene 1 opens with hook 1. Swap in the chosen hook but keep anything the scene says after it.
function sceneLine(script: Script, hookIndex: number, i: number): string {
  const scene = script.scenes[i];
  const chosen = script.hooks[hookIndex]?.line;
  if (i !== 0 || hookIndex === 0 || !chosen) return scene.voiceover;
  const original = script.hooks[0]?.line ?? "";
  if (original && scene.voiceover.includes(original)) return scene.voiceover.replace(original, chosen);
  return chosen;
}

function scriptToText(script: Script, hookIndex: number): string {
  const hook = script.hooks[hookIndex];
  const scenes = script.scenes.map((s, i) => {
    const line = sceneLine(script, hookIndex, i);
    const overlay = s.onScreenText ? `\n   Text: ${s.onScreenText}` : "";
    return `${s.start}–${s.end}s · ${s.shot}\n   Say: ${line}${overlay}`;
  });
  return [`HOOK: ${hook?.line ?? ""}`, "", ...scenes, "", `CAPTION: ${script.caption}`].join("\n");
}

export default function Home() {
  const [idea, setIdea] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram Reels");
  const [lengthSeconds, setLengthSeconds] = useState<Length>(30);
  const [script, setScript] = useState<Script | null>(null);
  const [hookIndex, setHookIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(0);
  const [scriptKey, setScriptKey] = useState(0);
  const [shownLength, setShownLength] = useState<Length>(30);

  useEffect(() => setUsed(readUsed()), []);

  const left = Math.max(0, FREE_SCRIPTS - used);
  const outOfFree = left === 0;

  async function generate() {
    if (outOfFree) return;
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, platform, lengthSeconds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.script) throw new Error(data.error ?? "Something went wrong. Try again.");
      setScript(data.script);
      setShownLength(lengthSeconds);
      setScriptKey((k) => k + 1);
      setHookIndex(0);
      const next = used + 1;
      setUsed(next);
      writeUsed(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(scriptToText(script, hookIndex));
      setCopied(true);
    } catch {
      setError("Couldn't copy. Select the text and copy it manually.");
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <div className="brand">hook<span>draft</span></div>
        <div className="quota">{left} free {left === 1 ? "script" : "scripts"} left</div>
      </div>

      <h1 className="headline">Dump the idea.<br />Get the reel.</h1>

      <div className="field">
        <label className="label" htmlFor="idea">Brain-dump</label>
        <textarea
          id="idea"
          className="idea"
          placeholder="Messy is fine. e.g. Quit my 9–5 last month. What nobody tells you about week one."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={2000}
        />
        {!script && (
          <div className="examples">
            <span className="examples-label">Or try one:</span>
            {EXAMPLE_IDEAS.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="chip"
                onClick={() => { setIdea(ex.idea); setPlatform(ex.platform); setLengthSeconds(ex.lengthSeconds); }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="row">
        <div className="field">
          <label className="label" htmlFor="platform">Platform</label>
          <select id="platform" className="select" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="length">Length</label>
          <select id="length" className="select" value={lengthSeconds} onChange={(e) => setLengthSeconds(Number(e.target.value) as typeof lengthSeconds)}>
            {LENGTHS.map((l) => <option key={l} value={l}>{l} seconds</option>)}
          </select>
        </div>
      </div>

      {outOfFree ? (
        <div className="notice">
          <div>You’ve used your free {FREE_SCRIPTS === 1 ? "script" : "scripts"}. Upgrade to keep writing.</div>
          {PAYMENT_LINK ? (
            <a className="btn btn-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} href={PAYMENT_LINK}>
              Upgrade for unlimited scripts
            </a>
          ) : (
            <div style={{ color: "var(--muted)" }}>Upgrades are coming soon.</div>
          )}
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={generate} disabled={loading || idea.trim().length < 10}>
          {loading ? "Writing your script…" : script ? "Generate a new script" : "Generate script"}
        </button>
      )}

      {error && <div className="error" role="alert">{error}</div>}

      {loading ? (
        <ScriptSkeleton />
      ) : script ? (
        <div className="reveal" key={scriptKey}>
          <ScriptView script={script} hookIndex={hookIndex} lengthSeconds={shownLength} onPickHook={(i) => { setHookIndex(i); setCopied(false); }} />
          <div className="actions">
            <button type="button" className="btn" onClick={generate} disabled={loading || outOfFree}>Regenerate</button>
            <button type="button" className="btn btn-strong" onClick={copy}>{copied ? "Copied" : "Copy script"}</button>
          </div>
        </div>
      ) : (
        <div className="preview" aria-label="Example of what you'll get">
          <div className="preview-tag">Example output</div>
          <ScriptView script={SAMPLE_SCRIPT} hookIndex={0} lengthSeconds={30} />
        </div>
      )}
    </main>
  );
}

function ScriptView({ script, hookIndex, lengthSeconds, onPickHook }: { script: Script; hookIndex: number; lengthSeconds: number; onPickHook?: (i: number) => void }) {
  return (
    <div className="script">
      <section className="field" aria-labelledby={onPickHook ? "hooks-h" : undefined}>
        <h2 id={onPickHook ? "hooks-h" : undefined} className="label" style={{ margin: 0 }}>{onPickHook ? "Pick a hook" : "3 hooks to choose from"}</h2>
        <div className="hooks">
          {script.hooks.map((h, i) => (
            <button
              key={i}
              type="button"
              className="hook"
              aria-pressed={i === hookIndex}
              onClick={onPickHook ? () => onPickHook(i) : undefined}
              tabIndex={onPickHook ? undefined : -1}
            >
              <span className="hook-style">{h.style}</span>
              <span className="hook-line">{h.line}</span>
              <span className="hook-why">{h.why}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="field">
        <h2 className="label" style={{ margin: 0 }}>Scenes · {lengthSeconds}s</h2>
        <div className="scenes">
          {script.scenes.map((s, i) => (
            <div key={i} className="scene">
              <div className="scene-time">{s.start}–{s.end}s</div>
              <div className="scene-body">
                <div>{sceneLine(script, hookIndex, i)}</div>
                <div className="scene-shot">{s.shot}</div>
                {s.onScreenText && <div className="scene-text"><b>Text:</b> {s.onScreenText}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="field">
        <h2 className="label" style={{ margin: 0 }}>Caption</h2>
        <div className="caption">{script.caption}</div>
      </section>
    </div>
  );
}

function ScriptSkeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">Writing your script…</span>
      <div className="sk sk-label" />
      {[0, 1, 2].map((i) => <div key={i} className="sk sk-hook" style={{ animationDelay: `${i * 120}ms` }} />)}
      <div className="sk sk-label" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="sk sk-line" style={{ animationDelay: `${i * 90}ms` }} />)}
    </div>
  );
}
