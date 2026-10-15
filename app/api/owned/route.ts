import { PRODUCT_IDS } from "@/lib/products"
import { SESSION_RE, vatarConfigured, verifySession } from "@/lib/vatar/server"
import { ownedProducts, storeConfigured } from "@/lib/vatar/store"

export const dynamic = "force-dynamic"

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

/**
 * GET with header `Authorization: Bearer <session>` (kept out of the URL so tokens don't land in logs).
 * Verifies the session with Vatar and returns the product IDs this player owns, so unlocks survive
 * reloads and new devices. Nothing here trusts the client beyond the session token.
 */
export async function GET(req: Request) {
  if (!vatarConfigured() || !storeConfigured()) return json(503, { code: "not_configured" })

  const session = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!SESSION_RE.test(session)) return json(400, { code: "bad_request" })

  const me = await verifySession(session)
  if (!me.ok) return json(403, { code: "bad_session" })

  try {
    const productIds = (await ownedProducts(me.data.mode, me.data.playerId)).filter((id) => PRODUCT_IDS.includes(id))
    return json(200, { productIds })
  } catch {
    return json(502, { code: "store_failed" })
  }
}
