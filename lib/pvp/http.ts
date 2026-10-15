import { BELTS } from "@/lib/game/belts"
import { sanitizeCustom } from "@/lib/game/customize"
import { FIGHTERS } from "@/lib/game/fighters"
import { pvpStoreAvailable } from "./store"
import type { Loadout } from "./types"

export function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => "")
  if (!text || text.length > 16000) return null
  try {
    const j = JSON.parse(text)
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function notConfigured() {
  return pvpStoreAvailable() ? null : json(503, { code: "not_configured" })
}

export function cleanName(v: unknown, fallback = "Fighter") {
  const s = typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) : ""
  return s || fallback
}

export function cleanLoadout(raw: unknown, name: string): Loadout | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const fighterId = typeof r.fighterId === "string" && FIGHTERS.some((f) => f.id === r.fighterId) ? r.fighterId : null
  if (!fighterId) return null
  const belt = typeof r.belt === "string" && BELTS.some((b) => b.id === r.belt) ? r.belt : null
  return { fighterId, name, custom: sanitizeCustom(r.custom), belt }
}

export const VIEWER_RE = /^[A-Za-z0-9_-]{6,40}$/
