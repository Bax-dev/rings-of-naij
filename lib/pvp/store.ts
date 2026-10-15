// Server-side only: online match rooms, the move relay, spectators and results, in Upstash Redis.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { NetEvent, Reaction } from "@/lib/game/net-types"
import { getRedis } from "@/lib/vatar/store"
import { memoryRedis } from "./memory-redis"
import type { Loadout } from "./types"

/** Rooms and everything in them expire on their own after two hours. */
const TTL = 60 * 60 * 2
/** The walk-out starts this long after the second fighter is in, so both phones are ready. */
const START_DELAY = 6000
const MAX_EVENTS_PER_SYNC = 40
const MAX_REACTIONS = 200

export type Seat = 0 | 1

export interface MatchMeta {
  id: string
  code: string | null
  /** Set when the match came from Vatar.match, so the result is posted back to Vatar. */
  vatar: boolean
  mode: "live" | "test" | "guest"
  p0: string | null
  p1: string | null
  l0: Loadout | null
  l1: Loadout | null
  startAt: number | null
  winner: string | null
}

const k = {
  meta: (id: string) => `pvp:m:${id}`,
  ev: (id: string, seat: Seat) => `pvp:ev:${id}:${seat}`,
  seen: (id: string, seat: Seat) => `pvp:seen:${id}:${seat}`,
  report: (id: string, seat: Seat) => `pvp:rep:${id}:${seat}`,
  code: (code: string) => `pvp:code:${code}`,
  queue: () => `pvp:queue`,
  live: () => `pvp:live`,
  watchers: (id: string) => `pvp:w:${id}`,
  rx: (id: string) => `pvp:rx:${id}`,
  rxLimit: (id: string, viewer: string) => `pvp:rxl:${id}:${viewer}`,
}

type Store = NonNullable<ReturnType<typeof getRedis>>

/** Redis, or in development without one, an in-memory stand-in so online fights can be tried locally. */
export function pvpStoreAvailable() {
  return !!getRedis() || process.env.NODE_ENV !== "production"
}

function redis(): Store {
  const r = getRedis()
  if (r) return r
  if (process.env.NODE_ENV !== "production") return memoryRedis as unknown as Store
  throw new Error("store not configured")
}

function secret() {
  const s = process.env.PVP_SECRET ?? process.env.VATAR_SECRET
  if (s) return s
  if (process.env.NODE_ENV === "production") throw new Error("PVP_SECRET or VATAR_SECRET must be set")
  return "dev-only-pvp-secret"
}

// ---------- tokens ----------

/** A short signed token naming the match, seat and player, so each sync doesn't need a Vatar session. */
export function signToken(matchId: string, seat: Seat, playerId: string) {
  const body = Buffer.from(JSON.stringify({ m: matchId, s: seat, p: playerId })).toString("base64url")
  const mac = createHmac("sha256", secret()).update(body).digest("base64url")
  return `${body}.${mac}`
}

export function readToken(token: unknown): { matchId: string; seat: Seat; playerId: string } | null {
  if (typeof token !== "string" || token.length > 600) return null
  const [body, mac] = token.split(".")
  if (!body || !mac) return null
  const want = createHmac("sha256", secret()).update(body).digest()
  const got = Buffer.from(mac, "base64url")
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString()) as { m: string; s: number; p: string }
    if (typeof j.m !== "string" || (j.s !== 0 && j.s !== 1) || typeof j.p !== "string") return null
    return { matchId: j.m, seat: j.s, playerId: j.p }
  } catch {
    return null
  }
}

// ---------- rooms ----------

export async function getMeta(id: string): Promise<MatchMeta | null> {
  return (await redis().get<MatchMeta>(k.meta(id))) ?? null
}

async function putMeta(m: MatchMeta) {
  await redis().set(k.meta(m.id), m, { ex: TTL })
}

function newCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  return Array.from(randomBytes(6), (b) => letters[b % letters.length]).join("")
}

/** Puts a player in a seat (or finds the seat they already have) and records their loadout. */
export async function takeSeat(meta: MatchMeta, playerId: string, loadout: Loadout, prefer?: Seat): Promise<Seat | null> {
  let seat: Seat | null = meta.p0 === playerId ? 0 : meta.p1 === playerId ? 1 : null
  if (seat === null && prefer !== undefined && !(prefer === 0 ? meta.p0 : meta.p1)) seat = prefer
  if (seat === null) {
    if (!meta.p0) seat = 0
    else if (!meta.p1) seat = 1
    else return null
  }
  if (seat === 0) {
    meta.p0 = playerId
    meta.l0 = loadout
  } else {
    meta.p1 = playerId
    meta.l1 = loadout
  }
  if (meta.p0 && meta.p1 && !meta.startAt) {
    meta.startAt = Date.now() + START_DELAY
    await redis().zadd(k.live(), { score: meta.startAt, member: meta.id })
  }
  await putMeta(meta)
  return seat
}

/** A room for a match Vatar created. The id is Vatar's match id. */
export async function vatarRoom(id: string, mode: "live" | "test"): Promise<MatchMeta> {
  const existing = await getMeta(id)
  if (existing) return existing
  const meta: MatchMeta = { id, code: null, vatar: true, mode, p0: null, p1: null, l0: null, l1: null, startAt: null, winner: null }
  await redis().set(k.meta(id), meta, { ex: TTL, nx: true })
  return (await getMeta(id)) ?? meta
}

/** Guest rooms, for playing outside Lagos Life: by code, or the next free quick-match room. */
export async function guestRoom(opts: { create?: boolean; code?: string; quick?: boolean }): Promise<MatchMeta | null> {
  const r = redis()
  if (opts.code) {
    const id = await r.get<string>(k.code(opts.code.toUpperCase()))
    return id ? getMeta(id) : null
  }
  if (opts.quick) {
    const waiting = await r.getdel<string>(k.queue())
    if (waiting) {
      const m = await getMeta(waiting)
      if (m && !m.p1) return m
    }
  }
  const id = `g_${randomBytes(9).toString("base64url")}`
  const code = newCode()
  const meta: MatchMeta = { id, code, vatar: false, mode: "guest", p0: null, p1: null, l0: null, l1: null, startAt: null, winner: null }
  await putMeta(meta)
  await r.set(k.code(code), id, { ex: TTL })
  if (opts.quick) await r.set(k.queue(), id, { ex: 120 })
  return meta
}

// ---------- relay ----------

function cleanEvents(raw: unknown): NetEvent[] {
  if (!Array.isArray(raw)) return []
  const out: NetEvent[] = []
  for (const ev of raw.slice(0, MAX_EVENTS_PER_SYNC)) {
    if (!ev || typeof ev !== "object") continue
    const s = JSON.stringify(ev)
    if (s.length > 300) continue
    const kind = (ev as { k?: unknown }).k
    if (typeof kind === "string" && ["atk", "pow", "dodge", "block", "step", "res", "hp", "ko"].includes(kind)) out.push(ev as NetEvent)
  }
  return out
}

/** One round trip from a fighter: store their new moves, hand back the other fighter's. */
export async function sync(matchId: string, seat: Seat, rawEvents: unknown, cursor: number, rcursor: number) {
  const r = redis()
  const other = (1 - seat) as Seat
  const events = cleanEvents(rawEvents)
  const p = r.pipeline()
  if (events.length) {
    p.rpush(k.ev(matchId, seat), ...events.map((e) => JSON.stringify(e)))
    p.expire(k.ev(matchId, seat), TTL)
  }
  p.set(k.seen(matchId, seat), Date.now(), { ex: TTL })
  p.lrange(k.ev(matchId, other), Math.max(0, cursor), -1)
  p.get(k.seen(matchId, other))
  p.get(k.meta(matchId))
  p.zcount(k.watchers(matchId), Date.now() - 8000, "+inf")
  p.lrange(k.rx(matchId), Math.max(0, rcursor), -1)
  const res = await p.exec()
  const off = events.length ? 2 : 0
  const theirs = (res[off + 1] as unknown[]).map(parse)
  const seen = res[off + 2] as number | null
  const meta = res[off + 3] as MatchMeta | null
  const watchers = res[off + 4] as number
  const rx = (res[off + 5] as unknown[]).map(parse) as Reaction[]
  return {
    events: theirs as NetEvent[],
    cursor: Math.max(0, cursor) + theirs.length,
    startAt: meta?.startAt ?? null,
    opp: (seat === 0 ? meta?.l1 : meta?.l0) ?? null,
    oppSeenAgo: seen ? Date.now() - Number(seen) : null,
    watchers,
    reactions: rx,
    rcursor: Math.max(0, rcursor) + rx.length,
    winner: meta?.winner ?? null,
  }
}

function parse(v: unknown) {
  if (typeof v === "string") {
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }
  return v
}

// ---------- spectators ----------

export async function watch(matchId: string, viewer: string, cursors: [number, number], rcursor: number) {
  const r = redis()
  const p = r.pipeline()
  p.zadd(k.watchers(matchId), { score: Date.now(), member: viewer })
  p.expire(k.watchers(matchId), TTL)
  p.lrange(k.ev(matchId, 0), Math.max(0, cursors[0]), -1)
  p.lrange(k.ev(matchId, 1), Math.max(0, cursors[1]), -1)
  p.get(k.meta(matchId))
  p.zcount(k.watchers(matchId), Date.now() - 8000, "+inf")
  p.lrange(k.rx(matchId), Math.max(0, rcursor), -1)
  const res = await p.exec()
  const e0 = (res[2] as unknown[]).map(parse) as NetEvent[]
  const e1 = (res[3] as unknown[]).map(parse) as NetEvent[]
  const meta = res[4] as MatchMeta | null
  const rx = (res[6] as unknown[]).map(parse) as Reaction[]
  return {
    events: [e0, e1] as [NetEvent[], NetEvent[]],
    cursors: [Math.max(0, cursors[0]) + e0.length, Math.max(0, cursors[1]) + e1.length] as [number, number],
    startAt: meta?.startAt ?? null,
    players: [meta?.l0 ?? null, meta?.l1 ?? null] as [Loadout | null, Loadout | null],
    watchers: res[5] as number,
    reactions: rx,
    rcursor: Math.max(0, rcursor) + rx.length,
    winner: meta?.winner ?? null,
  }
}

/** A cheer from the crowd. One per viewer per second. */
export async function react(matchId: string, viewer: string, reaction: Reaction) {
  const r = redis()
  const ok = await r.set(k.rxLimit(matchId, viewer), 1, { nx: true, ex: 1 })
  if (!ok) return false
  const p = r.pipeline()
  p.rpush(k.rx(matchId), JSON.stringify(reaction))
  p.ltrim(k.rx(matchId), -MAX_REACTIONS, -1)
  p.expire(k.rx(matchId), TTL)
  await p.exec()
  return true
}

/** Fights that started in the last few minutes and have no winner yet. */
export async function liveMatches() {
  const r = redis()
  const now = Date.now()
  await r.zremrangebyscore(k.live(), 0, now - 6 * 60 * 1000)
  const ids = (await r.zrange<string[]>(k.live(), now - 6 * 60 * 1000, now + 10000, { byScore: true })).slice(-20)
  const out = []
  for (const id of ids) {
    const m = await getMeta(id)
    if (!m || m.winner || !m.l0 || !m.l1 || !m.startAt) continue
    // A full fight is under two minutes; skip rooms whose fighters have both gone quiet.
    if (m.startAt < now - 2 * 60 * 1000) continue
    const [s0, s1] = await Promise.all([r.get<number>(k.seen(id, 0)), r.get<number>(k.seen(id, 1))])
    if (Math.max(Number(s0) || 0, Number(s1) || 0) < now - 15000) continue
    const watchers = await r.zcount(k.watchers(id), now - 8000, "+inf")
    out.push({ id, players: [m.l0, m.l1] as [Loadout, Loadout], watchers, startAt: m.startAt })
  }
  return out
}

// ---------- results ----------

export interface Report {
  hp: number
  oppHp: number
  ko: boolean
  won: boolean
  at: number
}

/**
 * Each fighter reports how it ended. Each side is the authority on its own health, so the winner
 * is whoever kept more of theirs. A fighter who stops syncing for 15 seconds forfeits.
 */
export async function report(meta: MatchMeta, seat: Seat, rep: Omit<Report, "at">): Promise<{ winner: string | "draw" | null; meta: MatchMeta }> {
  const r = redis()
  await r.set(k.report(meta.id, seat), { ...rep, at: Date.now() }, { ex: TTL })
  if (meta.winner) return { winner: meta.winner, meta }
  const other = (1 - seat) as Seat
  const [mine, theirs, theirSeen] = await Promise.all([
    r.get<Report>(k.report(meta.id, seat)),
    r.get<Report>(k.report(meta.id, other)),
    r.get<number>(k.seen(meta.id, other)),
  ])
  const ids = [meta.p0, meta.p1]
  let winner: string | "draw" | null = null
  if (mine && theirs) {
    const myHp = mine.hp
    const theirHp = theirs.hp
    winner = myHp <= 0 && theirHp <= 0 ? "draw" : myHp === theirHp ? "draw" : myHp > theirHp ? ids[seat] : ids[other]
  } else if (mine && mine.hp <= 0) winner = ids[other]
  else if (mine && (!theirSeen || Date.now() - Number(theirSeen) > 15000)) winner = ids[seat]
  if (winner) {
    meta.winner = winner
    await putMeta(meta)
    await r.zrem(k.live(), meta.id)
  }
  return { winner, meta }
}
