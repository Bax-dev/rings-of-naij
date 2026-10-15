import { json, notConfigured, readBody } from "@/lib/pvp/http"
import { getMeta, readToken, report } from "@/lib/pvp/store"
import { getRedis } from "@/lib/vatar/store"
import { getMatch, postMatchResult } from "@/lib/vatar/server"

export const dynamic = "force-dynamic"

/** POST { token, hp, oppHp, ko, won }: how the fight ended for me. Settles the match once there's a winner. */
export async function POST(req: Request) {
  const nc = notConfigured()
  if (nc) return nc
  const body = await readBody(req)
  const tok = readToken(body?.token)
  if (!body || !tok) return json(403, { code: "bad_token" })
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(500, v)) : 0)
  try {
    const meta = await getMeta(tok.matchId)
    if (!meta) return json(404, { code: "no_match" })
    const { winner } = await report(meta, tok.seat, { hp: num(body.hp), oppHp: num(body.oppHp), ko: body.ko === true, won: body.won === true })
    if (winner && meta.vatar) {
      // Settle with Vatar once. A repeat would get the same answer, but there's no need to ask twice.
      const first = await getRedis()?.set(`pvp:settled:${meta.id}`, 1, { nx: true, ex: 60 * 60 * 2 })
      if (first) {
        const m = await getMatch(meta.id)
        if (m.ok && m.data.status === "playing") await postMatchResult(meta.id, m.data.nonce, winner)
      }
    }
    return json(200, { winner, you: tok.playerId })
  } catch {
    return json(502, { code: "store_failed" })
  }
}
