# Vatar review checklist → code

| Review item | Where it's handled |
|---|---|
| SDK init seen | `components/vatar/vatar-provider.tsx`: `initVatar()` is module-level, so `Vatar.init()` runs once even under Strict Mode. |
| Test purchase made | Shop screen → `buy()` → `Vatar.purchase(id)`. Error codes `cancelled`, `payment_failed`, `owned`, `not_for_sale`, `busy` and `rate_limited` get friendly messages in `lib/vatar/types.ts`. |
| Purchase verified by our server | `app/api/claim/route.ts` calls `/session/verify` and `/purchases/{id}`, checks the player matches, and rejects refunds. |
| Purchase marked delivered | `app/api/claim/route.ts` stores ownership in Redis first (`lib/vatar/store.ts`), then calls `/purchases/{id}/deliver`. |
| Lost purchases recovered | `restore()`: `GET /api/owned` + `Vatar.purchases()` → claim; `Vatar.onPurchase` subscription. |
| Loads fast on mobile data | No game asset downloads (vector canvas art, Web Audio synthesis); fighter portraits are small PNGs. |
| 375×812 portrait, touch only | Layout capped at 480 px wide, `h-dvh`; tap left/right, swipe up/down, hold to block; no hover controls. |
| Pause / resume | `onPause`/`onResume` → `paused` → `FightEngine.setPaused()` stops the rAF loop, timers and the AudioContext. The game also pauses on `visibilitychange`. |
| Sound only after first tap | `lib/game/audio.ts` creates the AudioContext inside a pointer gesture only. |
| Honest product names and prices | `lib/products.ts`: cosmetic items and fighter unlocks only, nothing pay-to-win, ₦100–₦1,500, 6 products. |
| No own pay/sign-in forms, popups, fullscreen | None in the codebase; there are no logins and no personal data, and players are identified by `player.id` and session token. |
| Leaderboard | `submitScore` with a whole number, and the `too_soon` error is handled; the Leaderboard screen shows the top 50 and `me.label`. |
| Framing header | `next.config.mjs` sends `frame-ancestors` for all five Lagos Life origins, and no `X-Frame-Options`. |
| No gambling or real-money prizes | Online fights use `Vatar.match` with `stake: 0` only (friendlies). `components/game/versus-screen.tsx` never passes a stake. |
| Multiplayer result posted by our server | `app/api/pvp/report/route.ts` decides the winner and calls `postMatchResult` (`lib/vatar/server.ts`), signed with `VATAR_RESULTS_SECRET`. |
| Listing assets | `public/icon-512.png` (icon). **Still to do:** 3–5 screenshots, a short description (≤120 characters), a long description, and the Developer Agreement. |
