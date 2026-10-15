"use client"

import type { NetEvent, NetLink, Reaction } from "@/lib/game/net-types"
import type { JoinResponse, LiveMatch, Loadout, SyncResponse, WatchResponse } from "./types"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A random id kept on this device, for guest fights and for counting you in the gallery. */
export function deviceId() {
  const KEY = "ring-of-lagos:device"
  try {
    const have = window.localStorage.getItem(KEY)
    if (have) return have
    const id = `d_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`
    window.localStorage.setItem(KEY, id)
    return id
  } catch {
    return `d_${Math.random().toString(36).slice(2, 14)}`
  }
}

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" })
    const data = (await r.json().catch(() => ({}))) as T & { code?: string }
    return r.ok ? { ok: true, data } : { ok: false, code: data.code ?? `http_${r.status}` }
  } catch {
    return { ok: false, code: "offline" }
  }
}

export function joinVatarMatch(session: string, matchId: string, loadout: Omit<Loadout, "name">) {
  return post<JoinResponse>("/api/pvp/join", { session, matchId, loadout })
}

export function joinGuestMatch(how: { create?: boolean; code?: string; quick?: boolean }, name: string, loadout: Omit<Loadout, "name">) {
  return post<JoinResponse>("/api/pvp/join", { ...how, guest: { id: deviceId(), name }, loadout })
}

export async function fetchLive(): Promise<LiveMatch[]> {
  try {
    const r = await fetch("/api/pvp/live", { cache: "no-store" })
    if (!r.ok) return []
    return ((await r.json()) as { matches: LiveMatch[] }).matches
  } catch {
    return []
  }
}

export function sendReaction(matchId: string, name: string, e: string) {
  return post<{ ok: boolean }>("/api/pvp/react", { matchId, viewer: deviceId(), name, e })
}

/** Keeps an estimate of the server's clock. The fastest round trips give the best estimate. */
class ServerClock {
  offset = 0
  private best = Number.POSITIVE_INFINITY
  constructor(serverNow?: number) {
    if (serverNow) this.offset = serverNow - Date.now()
  }
  sample(sentAt: number, serverNow: number) {
    const rtt = Date.now() - sentAt
    if (rtt <= this.best * 1.25) {
      this.best = Math.min(this.best, rtt)
      this.offset = serverNow - (sentAt + rtt / 2)
    }
  }
  now() {
    return Date.now() + this.offset
  }
}

/** My side of an online fight: sends my moves, collects the other fighter's. */
export class FightLink implements NetLink {
  readonly matchId: string
  readonly code: string | null
  readonly seat: 0 | 1
  private token: string
  private outbox: NetEvent[] = []
  private inbox: NetEvent[] = []
  private rx: Reaction[] = []
  private cursor = 0
  private rcursor = 0
  private clockSrc: ServerClock
  private stopped = false
  startAt: number | null = null
  opp: Loadout | null = null
  oppSeenAgo: number | null = null
  watcherCount = 0
  winner: string | null = null
  failures = 0
  onChange: (() => void) | null = null

  constructor(join: JoinResponse) {
    this.matchId = join.matchId
    this.code = join.code
    this.seat = join.seat
    this.token = join.token
    this.clockSrc = new ServerClock(join.serverNow)
    void this.run()
  }

  private async run() {
    while (!this.stopped) {
      const started = Date.now()
      await this.tick()
      // Fast while fighting, gentle while waiting in the lobby.
      const every = this.startAt ? 110 : 700
      await sleep(Math.max(20, every - (Date.now() - started)))
    }
  }

  private async tick() {
    const events = this.outbox.splice(0, 40)
    const sentAt = Date.now()
    const r = await post<SyncResponse>("/api/pvp/sync", { token: this.token, events, cursor: this.cursor, rcursor: this.rcursor })
    if (!r.ok) {
      this.outbox.unshift(...events)
      this.failures++
      return
    }
    this.failures = 0
    const d = r.data
    this.clockSrc.sample(sentAt, d.serverNow)
    this.inbox.push(...d.events)
    this.cursor = d.cursor
    this.rx.push(...d.reactions)
    this.rcursor = d.rcursor
    this.oppSeenAgo = d.oppSeenAgo
    this.watcherCount = d.watchers
    this.winner = d.winner
    const changed = d.startAt !== this.startAt || (!!d.opp && !this.opp)
    this.startAt = d.startAt
    this.opp = d.opp ?? this.opp
    if (changed) this.onChange?.()
  }

  clock() {
    return this.startAt ? (this.clockSrc.now() - this.startAt) / 1000 : -1
  }

  send(ev: NetEvent) {
    this.outbox.push(ev)
  }

  drain(seat: "me" | "opp") {
    return seat === "opp" ? this.inbox.splice(0) : []
  }

  reactions() {
    return this.rx.splice(0)
  }

  watchers() {
    return this.watcherCount
  }

  oppAlive() {
    return this.failures > 20 || this.oppSeenAgo === null || this.oppSeenAgo < 15000
  }

  report(final: { hp: number; oppHp: number; ko: boolean; won: boolean }) {
    // Flush the last moves first so the other phone sees the knockout.
    const flush = async () => {
      for (let i = 0; i < 3 && this.outbox.length; i++) await this.tick()
      for (let i = 0; i < 5; i++) {
        const r = await post<{ winner: string | null }>("/api/pvp/report", { token: this.token, ...final })
        if (r.ok && r.data.winner) break
        await sleep(1500)
      }
      this.stop()
    }
    void flush()
  }

  stop() {
    this.stopped = true
  }
}

/** A spectator's view of someone else's fight: both fighters' moves, a little behind live. */
export class WatchLink implements NetLink {
  private inbox: [NetEvent[], NetEvent[]] = [[], []]
  private rx: Reaction[] = []
  private cursors: [number, number] = [0, 0]
  private rcursor = 0
  private clockSrc = new ServerClock()
  private stopped = false
  startAt: number | null = null
  players: [Loadout | null, Loadout | null] = [null, null]
  watcherCount = 0
  winner: string | null = null
  onChange: (() => void) | null = null

  constructor(readonly matchId: string) {
    void this.run()
  }

  private async run() {
    while (!this.stopped) {
      const started = Date.now()
      const sentAt = Date.now()
      const r = await post<WatchResponse>("/api/pvp/watch", { matchId: this.matchId, viewer: deviceId(), cursors: this.cursors, rcursor: this.rcursor })
      if (r.ok) {
        const d = r.data
        this.clockSrc.sample(sentAt, d.serverNow)
        this.inbox[0].push(...d.events[0])
        this.inbox[1].push(...d.events[1])
        this.cursors = d.cursors
        this.rx.push(...d.reactions)
        this.rcursor = d.rcursor
        this.watcherCount = d.watchers
        this.winner = d.winner
        const changed = d.startAt !== this.startAt || (!this.players[0] && !!d.players[0])
        this.startAt = d.startAt
        this.players = d.players
        if (changed) this.onChange?.()
      }
      await sleep(Math.max(20, 250 - (Date.now() - started)))
    }
  }

  clock() {
    return this.startAt ? (this.clockSrc.now() - this.startAt) / 1000 : -1
  }

  send() {}

  drain(seat: "me" | "opp") {
    return this.inbox[seat === "me" ? 0 : 1].splice(0)
  }

  reactions() {
    return this.rx.splice(0)
  }

  watchers() {
    return this.watcherCount
  }

  oppAlive() {
    return true
  }

  report() {}

  stop() {
    this.stopped = true
  }
}
