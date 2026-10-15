import { json, notConfigured, readBody } from "@/lib/pvp/http"
import { readToken, sync } from "@/lib/pvp/store"

export const dynamic = "force-dynamic"

/** POST { token, events, cursor, rcursor }: send my moves, get the other fighter's. Called ~8 times a second. */
export async function POST(req: Request) {
  const nc = notConfigured()
  if (nc) return nc
  const body = await readBody(req)
  const tok = readToken(body?.token)
  if (!body || !tok) return json(403, { code: "bad_token" })
  const cursor = typeof body.cursor === "number" ? Math.floor(body.cursor) : 0
  const rcursor = typeof body.rcursor === "number" ? Math.floor(body.rcursor) : 0
  try {
    const r = await sync(tok.matchId, tok.seat, body.events, cursor, rcursor)
    return json(200, { ...r, serverNow: Date.now() })
  } catch {
    return json(502, { code: "store_failed" })
  }
}
