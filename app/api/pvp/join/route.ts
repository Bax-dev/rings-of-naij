import { cleanLoadout, cleanName, json, notConfigured, readBody, VIEWER_RE } from "@/lib/pvp/http"
import { guestRoom, signToken, takeSeat, vatarRoom, type Seat } from "@/lib/pvp/store"
import { getMatch, MATCH_ID_RE, SESSION_RE, vatarConfigured, verifySession } from "@/lib/vatar/server"

export const dynamic = "force-dynamic"

/** Guest rooms (no Lagos Life sign-in) are for local testing, or when explicitly turned on. */
function guestsAllowed() {
  return process.env.ALLOW_GUEST_MATCHES === "1" || !vatarConfigured()
}

/**
 * POST { session, matchId, loadout }: take your seat in a match Vatar created (friendly, stake 0).
 * POST { guest: { id, name }, create | code | quick, loadout }: guest rooms, when allowed.
 * Returns a signed token the fighter uses for every sync.
 */
export async function POST(req: Request) {
  const nc = notConfigured()
  if (nc) return nc
  const body = await readBody(req)
  if (!body) return json(400, { code: "bad_request" })

  try {
    if (typeof body.session === "string" && typeof body.matchId === "string") {
      if (!vatarConfigured()) return json(503, { code: "not_configured" })
      if (!SESSION_RE.test(body.session) || !MATCH_ID_RE.test(body.matchId)) return json(400, { code: "bad_request" })
      const me = await verifySession(body.session)
      if (!me.ok) return json(403, { code: "bad_session" })
      const match = await getMatch(body.matchId)
      if (!match.ok) return json(404, { code: "no_match" })
      const index = match.data.players.findIndex((p) => p.playerId === me.data.playerId)
      if (index < 0 || index > 1) return json(403, { code: "not_in_match" })
      if (match.data.status !== "playing" && match.data.status !== "open") return json(409, { code: "match_over" })
      const loadout = cleanLoadout(body.loadout, cleanName(me.data.name))
      if (!loadout) return json(400, { code: "bad_loadout" })
      const meta = await vatarRoom(match.data.id, me.data.mode)
      const seat = await takeSeat(meta, me.data.playerId, loadout, index as Seat)
      if (seat === null) return json(409, { code: "full" })
      return json(200, { matchId: meta.id, code: null, seat, token: signToken(meta.id, seat, me.data.playerId), serverNow: Date.now() })
    }

    if (!guestsAllowed()) return json(403, { code: "guests_off" })
    const guest = body.guest as { id?: unknown; name?: unknown } | undefined
    if (!guest || typeof guest.id !== "string" || !VIEWER_RE.test(guest.id)) return json(400, { code: "bad_request" })
    const loadout = cleanLoadout(body.loadout, cleanName(guest.name, "Guest"))
    if (!loadout) return json(400, { code: "bad_loadout" })
    const code = typeof body.code === "string" && /^[A-Za-z]{6}$/.test(body.code) ? body.code : undefined
    const meta = await guestRoom({ create: body.create === true, code, quick: body.quick === true })
    if (!meta) return json(404, { code: "no_match" })
    const playerId = `guest:${guest.id}`
    const seat = await takeSeat(meta, playerId, loadout)
    if (seat === null) return json(409, { code: "full" })
    return json(200, { matchId: meta.id, code: meta.code, seat, token: signToken(meta.id, seat, playerId), serverNow: Date.now() })
  } catch {
    return json(502, { code: "store_failed" })
  }
}
