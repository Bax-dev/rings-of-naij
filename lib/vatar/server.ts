// Server-side only: holds VATAR_SECRET. Never import this from client components.
const API = "https://lagoslife.app/api/games/v1"

export interface VerifiedSession {
  playerId: string
  name: string
  gameId: string
  exp: number
  mode: "live" | "test"
}

export interface VatarPurchaseRecord {
  id: string
  productId: string
  playerId: string
  amount: number
  currency: string
  status: "paid" | "delivered" | "refunded"
  createdAt: number
  mode: "live" | "test"
}

type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string }

export function vatarConfigured() {
  return typeof process.env.VATAR_SECRET === "string" && process.env.VATAR_SECRET.startsWith("vtr_")
}

async function api<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch(API + path, {
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Authorization: `Bearer ${process.env.VATAR_SECRET}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (r.ok) return { ok: true, status: r.status, data: json as T }
    return { ok: false, status: r.status, code: typeof json.code === "string" ? json.code : `http_${r.status}` }
  } catch {
    return { ok: false, status: 502, code: "upstream_unreachable" }
  }
}

export const SESSION_RE = /^[A-Za-z0-9._-]{10,4096}$/
export const PURCHASE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function verifySession(session: string) {
  return api<VerifiedSession>("/session/verify", { session })
}

export function getPurchase(id: string) {
  return api<VatarPurchaseRecord>(`/purchases/${encodeURIComponent(id)}`)
}

export function deliverPurchase(id: string) {
  return api<{ id: string; status: "delivered"; deliveredAt: number }>(`/purchases/${encodeURIComponent(id)}/deliver`, {})
}

export interface VatarMatchRecord {
  id: string
  status: "open" | "playing" | "done" | "cancelled" | "void"
  stake: number
  seats: number
  players: { playerId: string; name: string }[]
  winner: string | null
  mode: "live" | "test"
  nonce: string
  startedAt: number | null
}

export const MATCH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function getMatch(id: string) {
  return api<VatarMatchRecord>(`/matches/${encodeURIComponent(id)}`)
}

/**
 * Settles a match. Signed with the results secret over five lines (method, path, timestamp, the
 * match's nonce, and the SHA-256 of the exact body), so only this server can ever post a result.
 */
export async function postMatchResult(id: string, nonce: string, winner: string | "draw"): Promise<ApiResult<VatarMatchRecord>> {
  const { createHash, createHmac } = await import("node:crypto")
  const path = `/api/games/v1/matches/${encodeURIComponent(id)}/result`
  const body = JSON.stringify({ winner })
  const ts = String(Math.floor(Date.now() / 1000))
  const sha = createHash("sha256").update(body).digest("hex")
  const sig = "v1=" + createHmac("sha256", process.env.VATAR_RESULTS_SECRET ?? "").update(["POST", path, ts, nonce, sha].join("\n")).digest("hex")
  try {
    const r = await fetch(API + `/matches/${encodeURIComponent(id)}/result`, {
      method: "POST",
      body,
      headers: {
        Authorization: `Bearer ${process.env.VATAR_SECRET}`,
        "Content-Type": "application/json",
        "X-Vatar-Timestamp": ts,
        "X-Vatar-Signature": sig,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (r.ok) return { ok: true, status: r.status, data: json as unknown as VatarMatchRecord }
    return { ok: false, status: r.status, code: typeof json.code === "string" ? json.code : `http_${r.status}` }
  } catch {
    return { ok: false, status: 502, code: "upstream_unreachable" }
  }
}
