# HookDraft pricing

Decided 2026-11-25.

## Plan

| | |
|---|---|
| Free | 1 script, no card. Hooks show before sign-in; the full script unlocks with an email link |
| Monthly | **$19/month** |
| Yearly | **$149/year** (about $12.42/month, ~35% off) |
| Trial | 7 days free, **card required up front** |
| Fair use | 100 scripts/month; one round of 3 variations counts as 3 |

## Why

- **Competitors:** hook and script tools start at $9–$19/month (HookMafia $19, Captain Hook AI $9, ScriptFlow $12, Scriptmine $9). Bigger script tools run $39–$49 (YouScript, Squibler Pro). Full video tools run $12–$39 (Revid, OpusClip, InVideo, CapCut Pro $19.99). $19 sits at the top of the hook tools and below the video tools. These figures came from third-party listings; check vendor pages before quoting them.
- **Don't price cheap:** a low price made a solo founder's app "look cheap" without bringing more buyers (reel DgJEFCrhgSF in MARKETING.md).
- **Card before trial:** fewer signups, but the ones who sign up are real buyers. It also stops people farming free scripts with new accounts.

## Unit economics

Measured 2026-11-25 on Claude Opus 5.5 ($4 / $20 per million input/output tokens):

| | Tokens (in / out) | Cost |
|---|---|---|
| One script | ~1,650 / ~1,550 | ~$0.04 |
| One round of 3 variations | ~2,875 / ~1,730, ×3 | ~$0.14 |
| Typical subscriber (20 scripts + 5 variation rounds) | | ~$1.50/month |
| Heavy subscriber (daily: 3 scripts + 1 variation round) | | ~$7.50/month |
| Worst case under the fair-use cap | | ~$5/month |

At $19, Stripe takes about $0.85, leaving roughly 90% margin on a typical subscriber and 55%+ on a heavy one. Each free script costs about $0.04.

100 subscribers is about $1,900/month in revenue, minus roughly $150 in API costs, $85 in Stripe fees and ~$20 in hosting.

## To learn after launch

- Whether people will pay $19 is unknown until real users hit the paywall. Track: free script → trial start → paid.
- A cheaper Claude model could roughly halve API cost. Compare script quality on the smoke-test ideas before switching.
