import { PRODUCT_IDS } from "@/lib/products"
import { PURCHASE_ID_RE, SESSION_RE, deliverPurchase, getPurchase, vatarConfigured, verifySession } from "@/lib/vatar/server"
import { recordOwnership, revokeOwnership, storeConfigured } from "@/lib/vatar/store"

export const dynamic = "force-dynamic"

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

/**
 * POST { session, purchaseId }
 * 1. Verify the session with Vatar to learn who is asking.
 * 2. Fetch the purchase from Vatar (the only source of truth for "paid").
 * 3. Reject unless it belongs to this player; 409 if refunded.
 * 4. Record ownership in Redis once per purchaseId (idempotent).
 * 5. Mark it delivered with Vatar, then return 200.
 * Ownership is stored BEFORE delivering, so a crash in between leaves the purchase "paid" and the
 * client's startup purchases() check simply claims it again.
 */
export async function POST(req: Request) {
  if (!vatarConfigured() || !storeConfigured()) return json(503, { code: "not_configured" })

  const body = (await req.json().catch(() => null)) as { session?: unknown; purchaseId?: unknown } | null
  const session = typeof body?.session === "string" ? body.session : ""
  const purchaseId = typeof body?.purchaseId === "string" ? body.purchaseId : ""
  if (!SESSION_RE.test(session) || !PURCHASE_ID_RE.test(purchaseId)) return json(400, { code: "bad_request" })

  const me = await verifySession(session)
  if (!me.ok) return json(403, { code: "bad_session" })

  const p = await getPurchase(purchaseId)
  if (!p.ok) return json(403, { code: "bad_purchase" })
  if (p.data.playerId !== me.data.playerId || p.data.mode !== me.data.mode) return json(403, { code: "not_yours" })
  if (p.data.status === "refunded") {
    await revokeOwnership(me.data.mode, me.data.playerId, p.data.id)
    return json(409, { code: "refunded" })
  }
  if (!PRODUCT_IDS.includes(p.data.productId)) return json(422, { code: "unknown_product" })

  try {
    const rec = await recordOwnership(me.data.mode, { playerId: me.data.playerId, productId: p.data.productId, purchaseId: p.data.id })
    if (rec.playerId !== me.data.playerId) return json(403, { code: "not_yours" })
  } catch {
    return json(502, { code: "store_failed" })
  }

  const d = await deliverPurchase(p.data.id)
  if (!d.ok) return json(d.status === 409 ? 409 : 502, { code: d.code })

  return json(200, { purchaseId: p.data.id, productId: p.data.productId })
}
