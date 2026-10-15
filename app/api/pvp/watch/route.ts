import { json, notConfigured, readBody, VIEWER_RE } from "@/lib/pvp/http"
import { watch } from "@/lib/pvp/store"
import { MATCH_ID_RE } from "@/lib/vatar/server"

export const dynamic = "force-dynamic"

/** POST { matchId, viewer, cursors, rcursor }: both fighters' moves for a spectator, and counts you in the gallery. */
export async function POST(req: Request) {
  const nc = notConfigured()
  if (nc) return nc
  const body = await readBody(req)
  if (!body || typeof body.matchId !== "string" || !MATCH_ID_RE.test(body.matchId)) return json(400, { code: "bad_request" })
  if (typeof body.viewer !== "string" || !VIEWER_RE.test(body.viewer)) return json(400, { code: "bad_request" })
  const c = Array.isArray(body.cursors) ? body.cursors : [0, 0]
  const cursors: [number, number] = [Math.floor(Number(c[0]) || 0), Math.floor(Number(c[1]) || 0)]
  const rcursor = Math.floor(Number(body.rcursor) || 0)
  try {
    return json(200, { ...(await watch(body.matchId, body.viewer, cursors, rcursor)), serverNow: Date.now() })
  } catch {
    return json(502, { code: "store_failed" })
  }
}
