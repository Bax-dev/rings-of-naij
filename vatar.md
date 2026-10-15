# Vatar Games SDK · v1 — Docs

Source: https://lagoslife.app/developers/docs

Your game runs on your own HTTPS site. A Vatar world (Lagos Life first) shows it in a locked-down frame in its Games app, and one script, the SDK, lets it ask for the player, a purchase or the leaderboard. Your server checks purchases with our API before it gives anything.

## Contents

1. [How it fits together](#how-it-fits-together)
2. [Quick start](#quick-start)
3. [A 30-line game](#a-30-line-game)
4. [Sandbox vs live keys](#sandbox-vs-live-keys)
5. [SDK reference](#sdk-reference)
6. [The purchase flow](#the-purchase-flow)
7. [Multiplayer matches](#multiplayer-matches)
8. [Your server: the API](#your-server-the-api)
9. [Webhooks](#webhooks)
10. [Error codes](#error-codes)
11. [Rate limits](#rate-limits)
12. [Security and data](#security-and-data)
13. [The review checklist](#the-review-checklist)
14. [Getting paid](#getting-paid)

---

## How it fits together

- **Your game** — Any web game (HTML5, Phaser, Unity WebGL, Godot…) on your HTTPS domain. It loads `vatar-games-v1.js` and calls `Vatar.*`.
- **The game player** — The world's page around your frame. It answers your game, shows its own pay sheet, and only ever talks to your approved address.
- **Your server** — Holds your secret key. Checks sessions and purchases with our API, gives the item, marks it delivered. Optional webhook.

You build and test everything in the **sandbox** first. [Get your keys](https://lagoslife.app/developers/keys) creates a draft with test keys at once; play your game in our real game player at `/developers/sandbox/<draft>` and make test purchases with no money. The **integration checklist** in your [dashboard](https://lagoslife.app/developers/dashboard) ticks itself as each part works, and Submit for review unlocks when it's done.

## Quick start

> **See a sample game:** [Play Tap Tap Lagos](https://lagoslife.app/developers/sample) right there, then copy its game and server code as your starting point.

### 1. Add the SDK

One script tag, served by us (about 5 KB, no build step). Load it from us, never a copy: it gets security fixes.

```html
<script src="https://lagoslife.app/sdk/vatar-games-v1.js"></script>
```

### 2. Let the world frame your game

Your page must allow being framed by the world's pages. Send this header (and no `X-Frame-Options: DENY` or `SAMEORIGIN`):

```http
Content-Security-Policy: frame-ancestors https://lagoslife.app https://www.lagoslife.app https://naijalife.app https://www.naijalife.app https://lagoslife.eliysites.com
```

### 3. Get your keys

The [short form](https://lagoslife.app/developers/keys) (signed in): your studio, contact email, game name, HTTPS address, an optional webhook and a one-line description. You get a **test secret** and a **test webhook signing secret** at once, shown once.

### 4. Play it in the sandbox

Add products in the dashboard, then open your sandbox. Your game runs in the real game player in TEST mode: sessions, purchases (Pay (test) / Fail (test)), leaderboards, your server's checks and webhooks all work, with no money.

### 5. Submit

Once the checklist is ticked, add your icon, screenshots, category and long description in the dashboard, agree to the [Developer Agreement](https://lagoslife.app/developers/agreement), and submit for review. Once approved you get your **live secret**, and the game is in every player's Games app.

## A 30-line game

A complete tap game with one ₦100 item ("double_taps") and a leaderboard. It asks your server (below) to check and deliver each purchase.

`index.html`

```html
<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://lagoslife.app/sdk/vatar-games-v1.js"></script>
<style>
  body { margin: 0; height: 100dvh; display: grid; place-items: center; text-align: center;
         font: 600 20px system-ui; background: #111; color: #fff }
  button { font: inherit; margin: 6px; padding: 14px 24px; border: 0; border-radius: 99px }
</style>
<p id="hi">Loading…</p>
<p>Taps: <b id="score">0</b></p>
<button id="tap">Tap!</button> <button id="boost">2× taps · ₦100</button>
<script>
  let score = 0, double = false
  const $ = (id) => document.getElementById(id)
  // your server checks every purchase with ours before it gives anything (see "Your server")
  const claim = async (p) => {
    const { session } = await Vatar.session()              // fresh, signed, 15 minutes
    const r = await fetch("/claim", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, purchaseId: p.purchaseId }) })
    if (r.ok) { double = true; $("boost").disabled = true }
  }
  Vatar.init().then(({ player }) => {
    $("hi").textContent = `Hi ${player.name} 👋🏾`
    Vatar.purchases().then((list) => list.forEach(claim))       // paid earlier, not delivered yet
  })
  Vatar.onPurchase(claim)                                         // paid while the game was away
  Vatar.onPause(() => (document.body.style.opacity = 0.5))
  Vatar.onResume(() => (document.body.style.opacity = 1))
  $("tap").onclick = () => {
    $("score").textContent = score += double ? 2 : 1
    Vatar.submitScore(score).catch(() => {})                     // one score every 20 s counts
  }
  $("boost").onclick = () => Vatar.purchase("double_taps").then(claim).catch((e) => console.log(e.code))
</script>
```

Products are made in the dashboard: the `productId` is the id you give it there (a–z, 0–9, `_` and `-`, up to 32 characters). Price, name and whether it's for sale always come from our records, never from your game.

## Sandbox vs live keys

|                        | Test (sandbox)                     | Live                            |
| ---------------------- | ---------------------------------- | ------------------------------- |
| Secret key             | `vtr_test_…`                       | `vtr_live_…`                    |
| Issued                 | With your draft (shown once)       | After approval (shown once)     |
| Webhook signing secret | `vtr_whsec_test_…`                 | `vtr_whsec_live_…`              |
| Sessions come from     | Your sandbox page (mode "test")    | The Games app (mode "live")     |
| Player ids             | `t_…`                              | `p_…`                           |
| Purchases              | Pay (test) / Fail (test): no money | Real money through our checkout |
| Earnings               | Never                              | 70% of every sale               |
| Leaderboard            | The test board                     | The live board                  |

Test and live never mix: a test secret only sees test sessions and test purchases, a live secret only live ones (anything else is `403 wrong_mode`). Each secret is stored by us only as a hash and shown once. Rotate either one from the dashboard at any time: the old one stops working at once, and its webhook signing secret changes with it. Keep secrets on your server, never in your game's code.

## SDK reference

Every call returns a Promise. A refusal is an `Error` with a `.code` from [Error codes](#error-codes).

### `Vatar.init()`

→ `{ player: { id, name, avatar }, session, mode }`

Call it first. `player.id` is a pseudonym made for your game only (`p_…` live, `t_…` test): the same player always gets the same id in your game, and a different one in every other game. `name` is their display name, `avatar` a small PNG picture (a data URL, or null). `session` is a signed token valid 15 minutes for your server to check. `mode` is "live" or "test".

### `Vatar.session()`

→ `{ session, exp }`

A fresh session token (they last 15 minutes). Ask for one whenever you call your server.

### `Vatar.purchase(productId)`

→ `{ purchaseId, productId }`

Opens the world's own pay sheet over your game (it pauses you): the item, its price and your studio, from our records. The player pays there, never in your game. It resolves once our server has the payment confirmed. If the player leaves to pay on the provider's page, your game reloads when they come back and gets the purchase through `onPurchase` and `purchases()`. One sheet at a time, and one request every 3 seconds.

### `Vatar.onPurchase(fn)`

→ `unsubscribe()`

Called with `{ purchaseId, productId }` for a purchase confirmed while no `purchase()` call was waiting for it (for example after the player came back from paying).

### `Vatar.purchases()`

→ `[{ purchaseId, productId }]`

This player's paid purchases in your game that your server hasn't marked delivered yet. Call it after `init()` to restore anything a crash or a reload interrupted.

### `Vatar.submitScore(n)`

→ `{ best, accepted }`

Your game's leaderboard keeps each player's best (highest) whole number. At most one score a player every 20 seconds (sooner is `too_soon`). A score is only a number: never prizes in money.

### `Vatar.leaderboard()`

→ `{ top: [{ rank, name, score }], me: { rank, label, score } | null }`

The top 50 (display names only) and this player's own place. Refreshed at most every 30 seconds. `me.rank` is the exact place within the top 1,000 (`null` beyond it); `me.label` is ready to show: `"#12"` or `"1,000+"`.

### `Vatar.onPause(fn)` · `Vatar.onResume(fn)`

→ `unsubscribe()`

The phone went to the background, or the pay sheet opened over your game: stop timers and sound until resume.

## The purchase flow

1. **Your game — `purchase("double_taps")`.** Your game only asks. Nothing is charged yet.
2. **Vatar — The pay sheet opens.** Over your game: the item, its price and your studio, all from our records. The game is paused.
3. **Player — The player taps Pay ₦100.** Real money through our checkout (in the sandbox: Pay (test), no money).
4. **Vatar — Our server verifies.** Only the payment provider's "paid", with the amount and currency checked, counts. Each payment is settled once. The sale is split 70/30.
5. **Your game — `{ purchaseId, productId }`.** Back in your game: `purchase()` resolves, or `onPurchase` fires after a trip to the payment page. Your webhook gets `purchase.paid`.
6. **Your server — Verify, give, deliver.** `GET /purchases/{id}` (paid, and this player's?), give the item once, `POST /purchases/{id}/deliver`.

A purchase is real only when our server says so. Never give an item because your game's code said "paid": check it with `GET /purchases/{id}`, make sure its `playerId` is the player asking, give it once per `purchaseId`, then mark it delivered. One-off products can be bought once per player; consumables any number of times.

## Multiplayer matches

Players challenge each other in your game and may stake the world's **in-game money** (never real money, never cashed out). The gameplay runs on your own server; ours holds the stakes and pays the pot. The result comes ONLY from your server, with your secret AND a signature made with your **results secret** (shown with your keys, as `VATAR_RESULTS_SECRET`): a phone can never post one.

### `Vatar.match.create({ stake, seats })`

→ `match`

A new match for 2–4 players. A stake opens the world's own confirm sheet (the stake, your game, what the winner takes); it comes off only on the player's tap. `stake: 0` is a friendly, with no sheet. Share `match.code` with friends.

### `Vatar.match.join(code)` · `Vatar.match.quick({ stake })`

→ `match`

Join by its six-letter code, or be paired with another player waiting in your game at the same stake. Full: it starts.

### `Vatar.match.current()` · `Vatar.match.leave()`

→ `match | null`

My match in your game. Leaving before it starts gives my stake back; after it starts, the stake stays in the pot.

### `Vatar.match.onUpdate(fn)`

→ `unsubscribe()`

Called with the match whenever it changes: `{ id, code, status, stake, seats, players: [{ id, name }], me, winner, result, endsAt, mode }`. `status` is open, playing, done, cancelled or void.

### `GET /matches/{id}`

→ `{ id, status, stake, seats, players: [{ playerId, name }], winner, result, pot, payout, mode, nonce, createdAt, startedAt, endsAt, settledAt }`

One match in your game. Check the players by their session tokens before you play the round. `nonce` is the match's own value you sign its result with (it also comes with `match.started`).

### `POST /matches/{id}/result`

Body: `{ winner: "<playerId>" | "draw" }`

→ the settled match

Signed: `X-Vatar-Timestamp` (now, whole seconds, within 5 minutes of ours) and `X-Vatar-Signature: v1=<hex>`, the HMAC-SHA256 with your results secret of five lines: the method (`POST`), the path, the timestamp, the match's `nonce`, and the hex SHA-256 of the exact body you send. Otherwise `401 bad_signature` or `401 stale_timestamp`; nothing is settled. Only while it's playing, only a player in it. Settled once: the winner gets the pot less the house's 5%, a draw gives every stake back; a replay gives the same answer (another winner afterwards is `409 already_settled`). No result within 2 hours of the start, or a match that never fills within 15 minutes: every stake goes back.

```js
// In the game: a 2-player match for ₦1,000 of the world's game money each (game money only, never real money)
const m = await Vatar.match.create({ stake: 1000, seats: 2 })  // the world's confirm sheet: the stake comes off on the player's own tap
showCode(m.code)                                              // a friend joins with: await Vatar.match.join(code)
Vatar.match.onUpdate((m) => {
  if (m.status === "playing") startRound(m.id, m.players)    // players: [{ id, name }] (per-game ids)
  if (m.status === "done") showWinner(m.winner)
})

// On YOUR server, when the round is over: the secret AND a signature with your RESULTS secret (a phone never can).
// match.nonce comes with match.started, and with GET /matches/{id}.
const path = `/api/games/v1/matches/${match.id}/result`
const body = JSON.stringify({ winner: winnerPlayerId })     // or { winner: "draw" }: every stake goes back
const ts = String(Math.floor(Date.now() / 1000))            // whole seconds, within 5 minutes of ours
const sha = crypto.createHash("sha256").update(body).digest("hex")
const sig = "v1=" + crypto.createHmac("sha256", process.env.VATAR_RESULTS_SECRET)
  .update(["POST", path, ts, match.nonce, sha].join("\n")).digest("hex")
await fetch(new URL(path, "https://lagoslife.app/api/games/v1"), { method: "POST", body, headers: {
  Authorization: `Bearer ${process.env.VATAR_SECRET}`, "Content-Type": "application/json",
  "X-Vatar-Timestamp": ts, "X-Vatar-Signature": sig } })
// The winner takes the pot less the house cut, settled once by our server. No result in time: every stake goes back.
```

- **Limits:** a match at most ₦100,000; a player at most ₦500,000 a day across all games; a game at most ₦50,000,000 a day in pots, and all of one creator's games together at most ₦50,000,000 (then the staked matches pause until tomorrow); the same two players at most 10 staked matches a day in one game. Matches need approval: the world turns matches on, and allows them for your game for the version it reviewed (until then `Vatar.match` answers `not_available` to players; your sandbox's test matches always work). Stakes need a second approval the same way: until then, friendlies. An approved update stops both until they're allowed again.
- **Your share:** 40% of the house's cut on matches in your game, as in-game money to your account in the world, and never from a match you play in yourself.
- **Webhooks:** `match.started` and `match.settled`, signed like `purchase.paid`.
- **Sandbox:** test matches use test game money, a ledger of its own (₦100,000 to start, topped up in the sandbox; never real, never your save), and the sandbox's test bot can take the other seat. Post the result with your test secret, signed with your test results secret: that ticks the multiplayer checklist item.

## Your server: the API

Base URL: `https://lagoslife.app/api/games/v1` for now: it may move to a Vatar address later, and we'll give notice first. HTTPS and JSON. Every call carries your secret, `Authorization: Bearer vtr_live_…` (or `vtr_test_…` in the sandbox), and a secret only ever sees its own game.

### `POST /session/verify`

Body: `{ session }`

→ `{ playerId, name, gameId, exp, mode }`

Who is playing: checks the token's signature, that it's for your game, that it hasn't expired (15 minutes) and that its mode matches your secret.

```bash
curl -X POST https://lagoslife.app/api/games/v1/session/verify \
  -H "Authorization: Bearer $VATAR_SECRET" -H "Content-Type: application/json" \
  -d '{"session":"vtr1.eyJ2IjoxLC…"}'

200 {"playerId":"p_Xc3V…","name":"Tolu","gameId":"9f2c…","exp":1791720000000,"mode":"live"}
```

### `GET /purchases/{id}`

→ `{ id, productId, playerId, amount, currency, status: "paid" | "delivered" | "refunded", createdAt, mode }`

One purchase in your game. `amount` is in naira. Unpaid or unknown purchases, and other games' purchases, are `404 not_found`.

```bash
curl https://lagoslife.app/api/games/v1/purchases/3b9d0c41e7a24f8f9a10 \
  -H "Authorization: Bearer $VATAR_SECRET"

200 {"id":"3b9d0c41e7a24f8f9a10","productId":"double_taps","playerId":"p_Xc3V…","amount":100,
     "currency":"NGN","status":"paid","createdAt":1791719400000,"mode":"live"}
```

### `POST /purchases/{id}/deliver`

→ `{ id, status: "delivered", deliveredAt }`

Marks it delivered. Safe to repeat (the same answer). A refunded purchase is `409 refunded`. Delivering only ever marks it delivered: nothing you send can mark anything paid.

```bash
curl -X POST https://lagoslife.app/api/games/v1/purchases/3b9d0c41e7a24f8f9a10/deliver \
  -H "Authorization: Bearer $VATAR_SECRET"

200 {"id":"3b9d0c41e7a24f8f9a10","status":"delivered","deliveredAt":1791719460000}
```

### Example server (Node)

A whole server in Node, with the purchase check and the webhook signature check:

`server.js`

```js
// server.js · node server.js (Node 18+, no packages). Your secret lives here, never in the game.
import http from "node:http"
import crypto from "node:crypto"

const API = "https://lagoslife.app/api/games/v1"
const SECRET = process.env.VATAR_SECRET            // vtr_test_… in the sandbox, vtr_live_… once approved
const WHSEC = process.env.VATAR_WEBHOOK_SECRET     // vtr_whsec_test_… / vtr_whsec_live_… (shown with the secret)

const api = async (path, body) => {
  const r = await fetch(API + path, { method: body ? "POST" : "GET", body: body && JSON.stringify(body),
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" } })
  return { http: r.status, ...(await r.json()) }
}
const read = (req) => new Promise((ok) => { const c = []; req.on("data", (x) => c.push(x)); req.on("end", () => ok(Buffer.concat(c))) })

http.createServer(async (req, res) => {
  const raw = await read(req)
  if (req.method === "POST" && req.url === "/claim") {
    const { session, purchaseId } = JSON.parse(raw)
    const me = await api("/session/verify", { session })                    // who is asking
    const p = await api(`/purchases/${encodeURIComponent(purchaseId)}`)     // is the purchase real?
    if (me.http !== 200 || p.http !== 200 || p.playerId !== me.playerId) return res.writeHead(403).end()
    if (p.status === "refunded") return res.writeHead(409).end()
    await giveItem(p.playerId, p.productId, p.id)    // in YOUR database, once per purchase id
    await api(`/purchases/${p.id}/deliver`, {})      // mark it delivered (safe to repeat)
    return res.writeHead(200).end("ok")
  }
  if (req.method === "POST" && req.url === "/vatar-webhook") {
    if (!signed(raw, req.headers["x-vatar-signature"])) return res.writeHead(401).end()
    const evt = JSON.parse(raw)   // a nudge: check evt.data.purchaseId with GET /purchases/{id} before giving anything
    return res.writeHead(200).end()
  }
  res.writeHead(404).end()
}).listen(8080)

/** X-Vatar-Signature: "sha256=" + hex HMAC-SHA256 of the raw body, keyed with your webhook signing secret */
function signed(raw, header) {
  const want = Buffer.from("sha256=" + crypto.createHmac("sha256", WHSEC).update(raw).digest("hex"))
  const got = Buffer.from(String(header ?? ""))
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}
```

## Webhooks

Optional: give a webhook address with your keys (or later in the dashboard). When a purchase is paid we POST `purchase.paid` to it. It's a nudge, not proof: check the purchase with the API before giving anything.

What we send:

```http
POST https://your.server/vatar-webhook
Content-Type: application/json
X-Vatar-Event: purchase.paid
X-Vatar-Delivery: evt_5f0c2a9e81d34b7c
X-Vatar-Signature: sha256=8a1f…(64 hex)

{"id":"evt_5f0c2a9e81d34b7c","type":"purchase.paid","mode":"live","createdAt":1791719400000,
 "data":{"purchaseId":"3b9d0c41e7a24f8f9a10","productId":"double_taps","playerId":"p_Xc3V…","amount":100,"currency":"NGN"}}
```

- **Signature:** `X-Vatar-Signature: sha256=` + the hex HMAC-SHA256 of the raw body, keyed with your webhook signing secret (`vtr_whsec_…`, shown with your secret). Compare in constant time (see `signed()` above). The body is ASCII JSON.
- **Delivery:** 5 s to answer. Any 2xx counts; anything else is tried again after 1 min, 10 min, 1 h, 6 h (5 tries in all). We don't follow redirects and never read your answer beyond its status.
- **Address rules:** HTTPS on port 443 and a public domain name: no IP addresses (nor names that stand for one, like `nip.io` or `sslip.io`), localhost, `.local` or `.internal` names, no `*.workers.dev` or load-balancer addresses (use your own domain, or Pages), no Vatar or Lagos Life addresses, no user name or password in it, at most 300 characters. Changing it after approval waits for review; the approved address stays live until then.
- **Testing:** the dashboard's **Send test webhook** button sends a signed test `purchase.paid` (mode "test") with your test signing secret. Test purchases in the sandbox send real test webhooks too.
- Each delivery has its own `id`: ignore ones you've already handled.

## Error codes

### In your game (the SDK's `error.code`)

| code              | means                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `not_framed`      | The game isn't open inside a Vatar world's game player (or the player didn't answer in 10 s).                                |
| `timeout`         | No answer in time.                                                                                                           |
| `rate_limited`    | Too many requests of this kind: slow down.                                                                                   |
| `busy`            | A pay sheet is already open.                                                                                                 |
| `cancelled`       | The player closed the pay sheet.                                                                                             |
| `payment_failed`  | The payment didn't go through.                                                                                               |
| `not_for_sale`    | That product isn't for sale (unknown, not approved yet, or turned off).                                                      |
| `owned`           | The player already owns this one-off product.                                                                                |
| `off`             | The game, or games by creators in this world, is turned off.                                                                 |
| `not_available`   | Matches aren't available in this game: the world turns them on, and allows them for your game (for the version it reviewed). |
| `signed_out`      | The player isn't signed in.                                                                                                  |
| `too_soon`        | One score a player every 20 seconds.                                                                                         |
| `friendly_only`   | Matches in this game are friendlies for now (no stakes), or stakes are off.                                                  |
| `limit`           | Over a limit: the match's stake, the player's day, the game's day, or the same two players' matches today.                   |
| `not_found`       | No such match (or no open match with that code).                                                                             |
| `not_open`        | That match is full, started or over.                                                                                         |
| `not_multiplayer` | The game isn't listed as multiplayer.                                                                                        |
| `bad_request`     | The message wasn't one the player understands.                                                                               |
| `error`           | Something went wrong on our side. Try again.                                                                                 |

### From the API

Errors come back as `{ "error": "<code>", "message": "…" }`.

| HTTP | code              | means                                                                         |
| ---- | ----------------- | ----------------------------------------------------------------------------- |
| 400  | `bad_request`     | The body isn't valid JSON, or a field is missing or the wrong shape.          |
| 401  | `bad_secret`      | No Authorization header, or the secret is wrong, rotated or for another game. |
| 401  | `invalid_token`   | The session token's signature doesn't hold (forged or damaged).               |
| 401  | `expired`         | The session token is more than 15 minutes old: ask the game for a fresh one.  |
| 403  | `wrong_game`      | The token or purchase belongs to another game.                                |
| 403  | `wrong_mode`      | A test secret used on live data, or a live secret on test data.               |
| 403  | `game_off`        | The game, or games by creators, is turned off: everything is refused.         |
| 404  | `not_found`       | No such purchase in this game (or it isn't paid yet).                         |
| 409  | `refunded`        | The purchase was refunded: don't deliver it.                                  |
| 409  | `not_playing`     | A match result for a match that isn't being played (not started, or over).    |
| 409  | `already_settled` | That match was already settled with another result.                           |
| 429  | `rate_limited`    | Too many requests: wait for the Retry-After seconds.                          |
| 500  | `error`           | Our side failed. Retry with backoff.                                          |

## Rate limits

### Your game (per player)

| call                     | at most                                          |
| ------------------------ | ------------------------------------------------ |
| `init()`                 | 10 a minute                                      |
| `session()`              | 10 a minute                                      |
| `purchase()`             | one every 3 seconds, and one pay sheet at a time |
| `purchases()`            | 20 a minute                                      |
| `submitScore()`          | one every 20 seconds                             |
| `leaderboard()`          | 12 a minute                                      |
| `match.create()` · `quick()` | one every 5 seconds                          |
| `match.join()` · `leave()`   | one every 3 seconds                          |
| any message              | 8 KB; unknown types and fields are dropped       |

### Your server (per game, per mode)

| what                 | at most                                  |
| -------------------- | ---------------------------------------- |
| API calls            | 600 a minute (then 429 with Retry-After) |
| Failed secret checks | 30 a minute from one address             |

## Security and data

- **The frame.** Your game runs in `sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"` with `allow="autoplay; gamepad"` and no referrer: no popups, alerts or new windows, no navigating the page around you, no downloads, no camera, microphone, location, payment or clipboard access. **Fullscreen is not granted** (since 11 Oct 2026): the game player already fills the phone, and our top bar stays on screen. Our pay sheet covers the whole player, top bar included, and card details are only ever entered on the payment provider's own page, so never draw a pay, card or sign-in form of your own.
- **Cookies.** Inside the frame your site is third-party, and many phones block its cookies. Know the player by the session token and `player.id`, not cookies.
- **Messages.** The SDK only talks to the world's own addresses (https://lagoslife.app, https://www.lagoslife.app, https://naijalife.app, https://www.naijalife.app, https://lagoslife.eliysites.com), never `"*"`, and the game player only listens to your frame on your approved address. Each message is checked against a strict shape and capped at 8 KB.
- **What you get.** A pseudonymous id unique to your game, the display name, the avatar picture and short-lived session tokens. Never usernames, emails, phone numbers, location, money or our ids, and you must not try to get them (Developer Agreement §8).
- **Your keys.** Server-side only, rotated at once if exposed. We never log them and never show them twice.
- **Reporting a problem.** Found a vulnerability? Email [support@lagoslife.app](mailto:support@lagoslife.app?subject=Security) with the subject "Security", privately, and give us time to fix it.

## The review checklist

What we check before a game goes live. Most of it you'll see ticked in your dashboard before you submit.

1. The integration checklist is all ticked: SDK init seen, a test purchase made, a purchase verified by your server, one marked delivered (a webhook answered 2xx is optional), and for a multiplayer game a test match created, joined and its result posted by your server.
2. Your HTTPS address loads inside the frame (the `frame-ancestors` header above), quickly, on mobile data.
3. Phone first: it plays well at 375 × 812 in portrait, by touch, with no hover-only controls.
4. It handles `onPause` and `onResume` (sound and timers stop), and sound starts only after the player's first tap.
5. Your server checks every purchase and marks it delivered; one-offs once per player, consumables again and again.
6. Products have clear names and honest prices (₦100 to ₦50,000, at most 20), with no fake timers or tricks.
7. The listing: an icon (square, 512 px; PNG, JPEG or WebP, not SVG), 3 to 5 screenshots, a short description of at most 120 characters and an honest long one.
8. No outside payments, payment links or ads for paying anywhere else; no logins or personal data; nothing against the Developer Agreement.
9. No gambling, real-money prizes or cash-out. Staking between players may only ever use the world's in-game money, through features we provide.

We approve, ask for changes (with a note in your dashboard) or reject. After approval, code you deploy at the same address updates as you ship it; a new address, webhook or listing goes back to review while the approved one stays live; new or changed products wait for review before they can be sold.

## Getting paid

**You keep 70%. Paid monthly.**

From your players' purchases, through our checkout. No card forms in your game, no payment code to write.

- **70/30 on the Gross Sale.** You earn 70% of what the player pays (less refunds, reversals and chargebacks); we keep 30% and pay the payment fees out of it. Your share is worked out by our server from our own price, never from anything sent to us.
- **Prices** are whole naira, ₦100 to ₦50,000 an item.
- **Payouts** by bank transfer, for each calendar month by the 15th of the next, once your balance is at least ₦5,000 (a smaller one carries over). We never ask for bank details in the dashboard: we contact you at your email.
- **Test free in the sandbox, no money.** Test purchases are never charged and never count towards your share.
- **Match stakes are game money.** Players may stake the world's in-game money (never real money, never cashed out). Your share: 40% of the house's cut on matches in your game, as in-game money to your account in the world, and never from a match you play in yourself (see [Multiplayer matches](#multiplayer-matches)).
- **Your dashboard** shows every sale, your share this month and all time, refunds and payouts. Test purchases never count.

### Ready?

Get your test keys and build in the sandbox today: [Get your keys](https://lagoslife.app/developers/keys).

---

Links: [Developers](https://lagoslife.app/developers) · [Dashboard](https://lagoslife.app/developers/dashboard) · [Agreement](https://lagoslife.app/developers/agreement) · [Terms](https://lagoslife.app/terms) · [vatar.com](https://vatar.com) · support@lagoslife.app