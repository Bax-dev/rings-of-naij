# Ring of Lagos

A phone-first rhythm boxing game for the Vatar Games platform (Lagos Life). It's built with Next.js and React, the fights are drawn on a `<canvas>`, it deploys on Vercel, and it runs inside the Lagos Life Games frame.

> The PRD asked for Vite + React. This project uses Next.js (App Router) instead, because a working build already existed. It meets the same targets: a static client page plus serverless `/api/*` functions on Vercel.

## Project layout

```
app/
  layout.tsx            loads the Vatar SDK (https://lagoslife.app/sdk/vatar-games-v1.js)
  page.tsx              the game
  api/claim/route.ts    POST: verify session + purchase with Vatar, store ownership, deliver
  api/owned/route.ts    GET:  verify session, return the player's owned product IDs
components/
  vatar/vatar-provider.tsx   SDK hook: init once, pause/resume, purchases, scores, leaderboard
  game/                       menu, HUD, career, daily, shop, leaderboard, results screens
lib/
  game/                 engine (rAF loop, rhythm, AI), renderer, fighters, Web Audio beats
  vatar/server.ts       Vatar server API client (server-only, holds VATAR_SECRET)
  vatar/store.ts        Upstash Redis ownership storage (server-only)
  products.ts           product IDs, display prices, season-pass contents
next.config.mjs         sends the frame-ancestors CSP header (no X-Frame-Options)
```

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in the values
pnpm dev
```

On `localhost` the SDK reports `not_framed`. The game then runs in practice mode: you can fight, but the shop and leaderboard are switched off and the screen says so. To test the real integration, use the sandbox (see below).

## Deploy on Vercel

1. Push the project to a Git repo and import it in Vercel. Framework preset: **Next.js**.
2. **Storage → Marketplace → Upstash (Redis)**: create a database and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. If you made the database directly in Upstash, set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` instead.
3. **Settings → Environment Variables**: add `VATAR_SECRET` = your `vtr_test_…` key.
4. Redeploy, because env var changes only apply to new deployments.
5. Check the header:
   ```bash
   curl -sI https://<your-app>.vercel.app | grep -i -E 'content-security|x-frame'
   ```
   You should see `content-security-policy: frame-ancestors https://lagoslife.app …` and **no** `x-frame-options`.

If `VATAR_SECRET` or the Redis variables are missing, `/api/claim` returns `503 not_configured` **without** delivering. The purchase stays "paid", and the game claims it again on the next launch once the config is fixed.

## Test in the sandbox

1. In the Vatar dashboard, set the Game URL to your Vercel URL.
2. Create the products below in the dashboard. They wait for review before they can be sold.
3. Open `https://lagoslife.app/developers/sandbox/<draft>`.
4. Work through these checks:
   - The greeting shows your test player name. This proves `init()` works.
   - Start a fight, then background the app or open the shop pay sheet. The fight and beat stop, and resume cleanly.
   - Play Daily Knockout. The score posts, and appears on the Leaderboard screen with your rank label.
   - Buy something in the Shop with test money. It unlocks, and the dashboard shows the purchase as **verified** and **delivered**.
   - Reload, or open on another device with the same test player. The item stays unlocked (`GET /api/owned`).
   - Kill the tab during a purchase, then reopen. `purchases()` finds the undelivered item and claims it.

When the review is approved, switch `VATAR_SECRET` to `vtr_live_…` and redeploy. Live and test ownership are stored under separate keys (`rol:live:*` and `rol:test:*`).

## Products

| Product ID | Item | Price |
|---|---|---|
| `gloves_gold` | Gold gloves skin | ₦100 |
| `trunks_ankara` | Ankara trunks skin | ₦200 |
| `entrance_talkingdrum` | Talking-drum entrance | ₦200 |
| `fighter_amapiano` | Unlock DJ Amapiano | ₦500 |
| `fighter_highlife` | Unlock Baba Highlife | ₦500 |
| `season_pass_1` | Season pass (both fighters, every skin, the entrance) | ₦1,500 |

Prices in `lib/products.ts` are for display only. The Vatar pay sheet always shows the real price.

## Purchase flow

1. The game calls `Vatar.purchase(id)`, and Vatar shows its own pay sheet (the game never draws one).
2. The game calls `Vatar.session()` for a fresh token, then sends `POST /api/claim {session, purchaseId}`.
3. The server calls `POST /session/verify` to get the player, then `GET /purchases/{id}`. It rejects the claim unless the purchase belongs to that player (403), and returns 409 if it was refunded.
4. The server records ownership in Redis with `SET NX` per purchaseId, then adds it to the player's owned hash. This is idempotent.
5. The server calls `POST /purchases/{id}/deliver` and returns 200.

On startup, the game calls `GET /api/owned`, then `Vatar.purchases()`, and claims anything still undelivered. `Vatar.onPurchase` covers purchases confirmed outside a pending call.

See [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) for how the code maps to the Vatar review checklist.
