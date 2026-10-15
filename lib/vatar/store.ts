// Server-side only: ownership storage in Upstash Redis. Serverless functions keep no memory,
// so this is where verified purchases live between requests and across devices.
import { Redis } from "@upstash/redis"

// The Vercel Marketplace integration sets KV_REST_API_*; a direct Upstash database sets UPSTASH_REDIS_REST_*.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

const redis = url && token ? new Redis({ url, token }) : null

export function storeConfigured() {
  return redis !== null
}

/** The shared Redis client, or null when no store is configured. */
export function getRedis() {
  return redis
}

type Mode = "live" | "test"

// Test and live players are separate people (t_… vs p_…), so keys are split by mode too.
const purchaseKey = (mode: Mode, purchaseId: string) => `rol:${mode}:purchase:${purchaseId}`
const ownedKey = (mode: Mode, playerId: string) => `rol:${mode}:owned:${playerId}`

export interface OwnershipRecord {
  playerId: string
  productId: string
  purchaseId: string
  at: number
}

/**
 * Records ownership once per purchaseId. Returns the stored record, which on a repeat claim is the
 * original one, so callers can check it still belongs to the same player.
 */
export async function recordOwnership(mode: Mode, rec: Omit<OwnershipRecord, "at">): Promise<OwnershipRecord> {
  if (!redis) throw new Error("store not configured")
  const fresh: OwnershipRecord = { ...rec, at: Date.now() }
  const created = await redis.set(purchaseKey(mode, rec.purchaseId), fresh, { nx: true })
  const stored = created ? fresh : ((await redis.get<OwnershipRecord>(purchaseKey(mode, rec.purchaseId))) ?? fresh)
  // HSET is idempotent, so a retry after a crash between the two writes still lands the grant.
  if (stored.playerId === rec.playerId) await redis.hset(ownedKey(mode, rec.playerId), { [rec.purchaseId]: stored.productId })
  return stored
}

/** Product IDs the player owns, from verified and recorded purchases. */
export async function ownedProducts(mode: Mode, playerId: string): Promise<string[]> {
  if (!redis) throw new Error("store not configured")
  const all = await redis.hgetall<Record<string, string>>(ownedKey(mode, playerId))
  return [...new Set(Object.values(all ?? {}))]
}

/** Removes a refunded purchase from the player's owned items. */
export async function revokeOwnership(mode: Mode, playerId: string, purchaseId: string) {
  if (!redis) return
  await redis.hdel(ownedKey(mode, playerId), purchaseId)
}
