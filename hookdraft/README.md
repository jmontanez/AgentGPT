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

To test real generation, run the dev server without `HOOKDRAFT_MOCK`, then `node scripts/smoke.mjs`. It scripts four ideas across Reels, TikTok and Shorts, makes variations of the first, prints everything, and flags hook-count or timing problems.

## How it works

- `app/page.tsx`: the single screen (idea → hooks → scenes → caption → copy).
- `app/api/generate/route.ts`: validates the request and returns the script.
- `lib/generate.ts`: the Claude call (`claude-opus-5-5`, structured output against the schema in `lib/schema.ts`, server-side fallback on refusals).
- `app/globals.css`: theme tokens at the top; swap them to apply a different look.

## Accounts and payments

Pricing and the reasoning behind it are in [PRICING.md](PRICING.md): 1 free script, then $19/month or $149/year with a 7-day trial (card required), 100 scripts a month fair use, variations count as 3.

- **Sign-in:** Supabase email links (no passwords). Without the three Supabase settings the app runs with no accounts and no limits, which is how local development and `scripts/smoke.mjs` work. In production it refuses to generate without them, so a missing setting can't mean unlimited free scripts.
- **Sign-in comes last:** visitors can generate before signing in. They see the 3 hooks right away; the full script stays on the server (`pending_scripts`) until they sign in, which unlocks it via `/api/claim` and uses their free script. Each connection can start 3 unsigned scripts a day (tracked by a salted IP hash).
- **Limits:** enforced on the server in `lib/billing.ts`, from the `usage` table. Failed generations don't count. Each user is also limited to 6 generations a minute.
- **Payments:** Stripe Checkout (`/api/checkout`), the Stripe billing portal (`/api/portal`), and a webhook (`/api/stripe/webhook`) that copies the subscription status onto the user's profile.

### Setting it up

1. **Supabase:** create a project and run the files in `supabase/migrations/` in order. (Done for the `hookdraft` project, ref `vkltzjwaqbhkevmdngcd`.) Under Authentication → URL Configuration, set the Site URL and add `<site>/auth/callback` as a redirect URL. Copy the project URL, publishable key and secret key into the environment.
2. **Stripe (test mode first):** create a "HookDraft" product with two recurring prices, $19/month and $149/year, and put their price IDs in `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`. Add a webhook endpoint at `<site>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.created/updated/deleted`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Turn on the customer portal (Settings → Billing → Customer portal).
3. **Hosting:** set every variable in `.env.example` in the host's environment settings.

## Before launch

- **Replace the API key.** The current "Hookdraft" key is a 30-day testing key (expires Dec 25, 2026). Make a new production key with a longer expiry, set it in the hosting provider's environment variables, then delete the testing key in the Claude Console.
- Switch Stripe to live mode: recreate the product and prices in live mode, add a live webhook, and swap in the live keys and price IDs.
- Two requests sent at the same moment can both pass the limit check. The per-minute rate limit keeps this small; a database-side check would close it fully.
