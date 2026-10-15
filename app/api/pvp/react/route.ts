import { cleanName, json, notConfigured, readBody, VIEWER_RE } from "@/lib/pvp/http"
import { react } from "@/lib/pvp/store"
import { REACTIONS } from "@/lib/pvp/types"
import { MATCH_ID_RE } from "@/lib/vatar/server"

export const dynamic = "force-dynamic"

/** POST { matchId, viewer, name, e }: a spectator's cheer, shown to the fighters and the gallery. */
export async function POST(req: Request) {
  const nc = notConfigured()
  if (nc) return nc
  const body = await readBody(req)
  if (!body || typeof body.matchId !== "string" || !MATCH_ID_RE.test(body.matchId)) return json(400, { code: "bad_request" })
  if (typeof body.viewer !== "string" || !VIEWER_RE.test(body.viewer)) return json(400, { code: "bad_request" })
  if (typeof body.e !== "string" || !(REACTIONS as readonly string[]).includes(body.e)) return json(400, { code: "bad_request" })
  try {
    const ok = await react(body.matchId, body.viewer, { e: body.e, name: cleanName(body.name, "Fan") })
    return json(ok ? 200 : 429, { ok })
  } catch {
    return json(502, { code: "store_failed" })
  }
}
