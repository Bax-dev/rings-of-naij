import type { AttackType } from "./fighters"

/**
 * Everything one fighter's phone tells the other during an online fight.
 * Times are on the shared match clock, in seconds since the fight started.
 * Each side is the only authority on damage it takes: it resolves incoming strikes against its
 * own dodges and blocks, then reports the result and its health.
 */
export type NetEvent =
  | { k: "atk"; id: number; side: 1 | -1; type: AttackType; at: number; dmg: number; combo?: string }
  | { k: "pow"; id: number; at: number; dmg: number }
  | { k: "dodge"; dir: "up" | "down"; from: number; until: number }
  | { k: "block"; on: boolean; at: number }
  | { k: "step"; dir: 1 | -1; at: number }
  | { k: "res"; id: number; r: "hit" | "block" | "dodge"; dmg: number }
  | { k: "hp"; hp: number; vibe: number; at: number }
  | { k: "ko"; at: number }

export interface Reaction {
  e: string
  name: string
}

export interface NetLink {
  /** Shared match clock in seconds (0 = first bell of the walk-out). */
  clock(): number
  send(ev: NetEvent): void
  /** New events from a seat since the last call. In a fight, seat "opp" is the other player. */
  drain(seat: "me" | "opp"): NetEvent[]
  /** New spectator reactions since the last call. */
  reactions(): Reaction[]
  watchers(): number
  /** Whether the other player is still connected. */
  oppAlive(): boolean
  report(final: { hp: number; oppHp: number; ko: boolean; won: boolean }): void
}
