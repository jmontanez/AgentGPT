"use client";

import { useCallback, useEffect, useState } from "react";
import { LENGTHS, PLATFORMS, type Script, type Variation } from "@/lib/schema";
import { SAMPLE_SCRIPT } from "@/lib/sample";

type Platform = (typeof PLATFORMS)[number];
type Length = (typeof LENGTHS)[number];

// One tap fills the form, so a first-time visitor gets to a real script without having to think of an idea.
const EXAMPLE_IDEAS: { label: string; idea: string; platform: Platform; lengthSeconds: Length }[] = [
  { label: "Meal prep on a budget", idea: "How I meal prep a week of lunches for under $30", platform: "TikTok", lengthSeconds: 30 },
  { label: "Desk posture mistakes", idea: "3 posture mistakes I see every day as a physical therapist, from people who work at a desk", platform: "Instagram Reels", lengthSeconds: 30 },
  { label: "Behind the counter", idea: "Small bakery owner: what happens to the unsold bread at closing time", platform: "YouTube Shorts", lengthSeconds: 30 },
];

// Account state from /api/me. accounts=false means the server runs without sign-in (local development).
type Me =
  | { accounts: false }
  | { accounts: true; signedIn: false; freeScripts: number }
  | { accounts: true; signedIn: true; email: string | null; plan: string; subscribed: boolean; used: number; limit: number; monthlyLimit: number; variationUnits: number };

type Panel = null | "signin" | "paywall";

// The idea survives the trip out to the sign-in email and Stripe and back.
const DRAFT_KEY = "hookdraft.draft";
function saveDraft(d: { idea: string; platform: Platform; lengthSeconds: Length }) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ }
}
function takeDraft(): { idea: string; platform: Platform; lengthSeconds: Length } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { res, data };
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
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scriptKey, setScriptKey] = useState(0);
  const [shownLength, setShownLength] = useState<Length>(30);
  // The idea/platform/length the current script was made from, so variations match it even if the form changed since.
  const [source, setSource] = useState<{ idea: string; platform: Platform; lengthSeconds: Length } | null>(null);
  const [variations, setVariations] = useState<Variation[] | null>(null);
  const [varLoading, setVarLoading] = useState(false);
  const [active, setActive] = useState(0); // 0 = original, 1..n = variations
  const [me, setMe] = useState<Me | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const shown: Script | null = active > 0 && variations ? variations[active - 1] ?? script : script;

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = (await res.json()) as Me;
      setMe(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // On load: restore a saved idea, and react to coming back from the sign-in email or Stripe.
  useEffect(() => {
    const draft = takeDraft();
    if (draft) { setIdea(draft.idea); setPlatform(draft.platform); setLengthSeconds(draft.lengthSeconds); }
    const params = new URLSearchParams(window.location.search);
    if (params.get("signin") === "failed") setError("That sign-in link didn't work or has expired. Send a new one.");
    const checkout = params.get("checkout");
    if (checkout === "canceled") setNotice("Checkout canceled. Nothing was charged.");
    if (params.size) window.history.replaceState(null, "", "/");

    void (async () => {
      let data = await refreshMe();
      if (checkout === "success") {
        setNotice("You're in. Your subscription is starting…");
        // Stripe tells the server a moment after the redirect, so check a few times.
        for (let i = 0; i < 6 && !(data?.accounts && data.signedIn && data.subscribed); i++) {
          await new Promise((r) => setTimeout(r, 1500));
          data = await refreshMe();
        }
        setNotice(data?.accounts && data.signedIn && data.subscribed ? "You're in. Write as many scripts as you like." : "Payment received. Your plan will show up in a minute; refresh if it doesn't.");
      }
    })();
  }, [refreshMe]);

  const signedIn = me?.accounts === true && me.signedIn;
  const subscribed = signedIn && me.subscribed;
  const left = signedIn ? Math.max(0, me.limit - me.used) : null;
  const variationUnits = signedIn ? me.variationUnits : 3;
  const canWrite = !me?.accounts || !signedIn || (left ?? 0) >= 1;
  const canVary = !me?.accounts || (subscribed && (left ?? 0) >= variationUnits);

  function quotaText(): string | null {
    if (!me || !me.accounts) return null;
    if (!me.signedIn) return `${me.freeScripts} free script`;
    if (me.subscribed) return `${left} of ${me.monthlyLimit} left this month`;
    return `${left} free ${left === 1 ? "script" : "scripts"} left`;
  }

  // Handles the account-related answers from the generate and variations endpoints.
  function handleGate(res: Response, data: { code?: string; error?: string }): boolean {
    if (res.status === 401 && data.code === "signin") {
      saveDraft({ idea, platform, lengthSeconds });
      setPanel("signin");
      return true;
    }
    if (res.status === 402 && data.code === "upgrade") {
      setPanel("paywall");
      void refreshMe();
      return true;
    }
    return false;
  }

  async function generate() {
    if (me?.accounts && !me.signedIn) { saveDraft({ idea, platform, lengthSeconds }); setPanel("signin"); return; }
    if (!canWrite) { setPanel("paywall"); return; }
    setLoading(true);
    setError(null);
    setNotice(null);
    setCopied(false);
    try {
      const { res, data } = await postJson("/api/generate", { idea, platform, lengthSeconds });
      if (handleGate(res, data)) return;
      if (!res.ok || !data.script) throw new Error(data.error ?? "Something went wrong. Try again.");
      setScript(data.script);
      setSource({ idea, platform, lengthSeconds });
      setVariations(null);
      setActive(0);
      setShownLength(lengthSeconds);
      setScriptKey((k) => k + 1);
      setHookIndex(0);
      void refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Three new takes on a script that worked, to post as separate videos. A paid feature; counts as 3 scripts.
  async function makeVariations() {
    if (!script || !source) return;
    if (!canVary) { setPanel(subscribed ? null : "paywall"); if (subscribed) setError(`Variations count as ${variationUnits} scripts and you have ${left} left this month.`); return; }
    setVarLoading(true);
    setError(null);
    setCopied(false);
    try {
      const { res, data } = await postJson("/api/variations", { ...source, script });
      if (handleGate(res, data)) return;
      if (!res.ok || !Array.isArray(data.variations)) throw new Error(data.error ?? "Something went wrong. Try again.");
      setVariations(data.variations);
      setActive(1);
      setHookIndex(0);
      setScriptKey((k) => k + 1);
      void refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setVarLoading(false);
    }
  }

  function showVersion(i: number) {
    setActive(i);
    setHookIndex(0);
    setCopied(false);
  }

  async function copy() {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(scriptToText(shown, hookIndex));
      setCopied(true);
    } catch {
      setError("Couldn't copy. Select the text and copy it manually.");
    }
  }

  async function openBilling() {
    const { res, data } = await postJson("/api/portal");
    if (res.ok && data.url) window.location.href = data.url;
    else setError(data.error ?? "Couldn't open billing. Try again.");
  }

  async function signOut() {
    await postJson("/api/auth/logout");
    setPanel(null);
    await refreshMe();
  }

  const quota = quotaText();

  return (
    <main className="page">
      <div className="topbar">
        <div className="brand">hook<span>draft</span></div>
        {quota && <div className="quota">{quota}</div>}
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

      {panel === "signin" ? (
        <SignIn onClose={() => setPanel(null)} />
      ) : panel === "paywall" || (signedIn && !subscribed && !canWrite) ? (
        <Paywall onError={setError} />
      ) : (
        <button type="button" className="btn btn-primary" onClick={generate} disabled={loading || varLoading || idea.trim().length < 10}>
          {loading ? "Writing your script…" : script ? "Generate a new script" : "Generate script"}
        </button>
      )}

      {notice && <div className="notice-ok" role="status">{notice}</div>}
      {error && <div className="error" role="alert">{error}</div>}

      {loading ? (
        <ScriptSkeleton />
      ) : script && shown ? (
        <div className="reveal" key={scriptKey}>
          {variations && (
            <div className="tabs" role="tablist" aria-label="Script versions">
              {["Original", ...variations.map((_, i) => `Variation ${i + 1}`)].map((name, i) => (
                <button key={name} type="button" role="tab" aria-selected={i === active} className="tab" onClick={() => showVersion(i)}>
                  {name}
                </button>
              ))}
            </div>
          )}
          {active > 0 && variations?.[active - 1] && <div className="changed">{variations[active - 1].changed}</div>}
          <ScriptView key={active} script={shown} hookIndex={hookIndex} lengthSeconds={shownLength} onPickHook={(i) => { setHookIndex(i); setCopied(false); }} />
          <div className="actions">
            <button type="button" className="btn" onClick={generate} disabled={loading || varLoading || !canWrite}>Regenerate</button>
            <button type="button" className="btn btn-strong" onClick={copy}>{copied ? "Copied" : "Copy script"}</button>
          </div>
          {!variations && (
            <button type="button" className="btn btn-variations" onClick={makeVariations} disabled={varLoading || loading}>
              {varLoading ? "Writing 3 variations…" : "Make 3 variations to post next"}
            </button>
          )}
          {!variations && (
            <p className="hint">
              {me?.accounts && !subscribed
                ? "Same core idea, three fresh angles, so you can repost what works. Part of the paid plan."
                : `Same core idea, three fresh angles, so you can repost what works without repeating yourself. Counts as ${variationUnits} scripts.`}
            </p>
          )}
        </div>
      ) : (
        <div className="preview" aria-label="Example of what you'll get">
          <div className="preview-tag">Example output</div>
          <ScriptView script={SAMPLE_SCRIPT} hookIndex={0} lengthSeconds={30} />
        </div>
      )}

      {signedIn && (
        <footer className="account">
          <span>{me.email}</span>
          {me.plan !== "free" && <button type="button" className="link" onClick={openBilling}>Billing</button>}
          <button type="button" className="link" onClick={signOut}>Sign out</button>
        </footer>
      )}
    </main>
  );
}

function SignIn({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setErr(null);
    const { res, data } = await postJson("/api/auth/login", { email });
    if (res.ok) setState("sent");
    else { setState("idle"); setErr(data.error ?? "Couldn't send the email. Try again."); }
  }

  if (state === "sent") {
    return (
      <div className="notice">
        <div><b>Check your email.</b> Tap the link we sent to {email} and you'll come straight back here, idea and all.</div>
        <button type="button" className="link" onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
  }
  return (
    <form className="notice" onSubmit={send}>
      <div><b>Your first script is free.</b> Enter your email and we'll send a one-tap sign-in link. No password.</div>
      <input className="input" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      {err && <div className="error">{err}</div>}
      <button type="submit" className="btn btn-primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
      <button type="button" className="link" onClick={onClose}>Not now</button>
    </form>
  );
}

function Paywall({ onError }: { onError: (m: string) => void }) {
  const [busy, setBusy] = useState<null | "monthly" | "yearly">(null);
  async function start(interval: "monthly" | "yearly") {
    setBusy(interval);
    const { res, data } = await postJson("/api/checkout", { interval });
    if (res.ok && data.url) { window.location.href = data.url; return; }
    setBusy(null);
    onError(data.error ?? "Couldn't open checkout. Try again.");
  }
  return (
    <div className="notice paywall">
      <div><b>Keep writing.</b> 100 scripts a month, plus 3-variation reposts so a video that works becomes a week of posts.</div>
      <button type="button" className="btn btn-primary" onClick={() => start("monthly")} disabled={busy !== null}>
        {busy === "monthly" ? "Opening checkout…" : "Start 7-day free trial · $19/month"}
      </button>
      <button type="button" className="btn" onClick={() => start("yearly")} disabled={busy !== null}>
        {busy === "yearly" ? "Opening checkout…" : "Or $149/year (save 35%)"}
      </button>
      <div className="fine">Card required to start the trial. Cancel anytime before it ends and you won't be charged.</div>
    </div>
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
