import type { Custom } from "@/lib/game/customize"
import type { NetEvent, Reaction } from "@/lib/game/net-types"

/** What a player brings to an online fight: their fighter, how they've customised it, and their belt. */
export interface Loadout {
  fighterId: string
  name: string
  custom?: Custom
  belt?: string | null
}

export interface JoinResponse {
  matchId: string
  code: string | null
  seat: 0 | 1
  token: string
  serverNow: number
}

export interface SyncResponse {
  events: NetEvent[]
  cursor: number
  serverNow: number
  /** Server time (ms) when the walk-out starts, once both fighters are in. */
  startAt: number | null
  opp: Loadout | null
  /** How long since the other player last synced, in ms. */
  oppSeenAgo: number | null
  watchers: number
  reactions: Reaction[]
  rcursor: number
  winner: string | null
}

export interface WatchResponse {
  events: [NetEvent[], NetEvent[]]
  cursors: [number, number]
  serverNow: number
  startAt: number | null
  players: [Loadout | null, Loadout | null]
  watchers: number
  reactions: Reaction[]
  rcursor: number
  winner: string | null
}

export interface LiveMatch {
  id: string
  players: [Loadout, Loadout]
  watchers: number
  startAt: number
}

export const REACTIONS = ["🔥", "👏", "🥊", "😱", "😂", "🇳🇬"] as const
