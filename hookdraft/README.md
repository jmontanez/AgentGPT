# HookDraft

Turn a rough video idea into a ready-to-film script for Instagram Reels, TikTok or YouTube Shorts: three hook options, a timed scene list with on-screen text, and a caption.

## Run it

```bash
cd hookdraft
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3100
```

Set `HOOKDRAFT_MOCK=1` to get a sample script without calling the API.

To test real generation, run the dev server without `HOOKDRAFT_MOCK`, then `node scripts/smoke.mjs`. It scripts four ideas across Reels, TikTok and Shorts, prints them, and flags hook-count or timing problems.

## How it works

- `app/page.tsx`: the single screen (idea → hooks → scenes → caption → copy).
- `app/api/generate/route.ts`: validates the request and returns the script.
- `lib/generate.ts`: the Claude call (`claude-opus-5-5`, structured output against the schema in `lib/schema.ts`, server-side fallback on refusals).
- `app/globals.css`: theme tokens at the top; swap them to apply a different look.

## Not done yet

- **Replace the API key before going live.** The current "Hookdraft" key is a 30-day testing key (expires Dec 25, 2026). Make a new production key with a longer expiry, set it in the hosting provider's environment variables, then delete the testing key in the Claude Console.

- The 1-free-script limit (`FREE_SCRIPTS` in `app/page.tsx`) is stored in the browser, so it's easy to get around. Before launch, add sign-in and count usage on the server.
- Payments: set `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` to a Stripe Payment Link. Paid accounts aren't recognized yet.
- No rate limiting on `/api/generate`.
