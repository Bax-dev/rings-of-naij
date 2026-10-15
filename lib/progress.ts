import type { Difficulty } from "./game/belts"
import type { Custom } from "./game/customize"

/**
 * Device-local game progress (career stage, chosen cosmetics, settings).
 * Paid ownership is NOT stored here: it comes from the server (GET /api/owned), which only
 * records purchases it has verified with the Vatar API.
 */
export interface Progress {
  careerStage: number
  fighterId: string
  muted: boolean
  tutorialSeen: boolean
  dailyBest: { key: string; score: number } | null
  difficulty: Difficulty
  /** Each fighter's look as the player customised it, by fighter id. */
  custom: Record<string, Custom>
  belts: string[]
  dailyWins: number
  pvp: { wins: number; losses: number }
  /** The coach in your corner (see lib/game/coaches.ts). */
  coachId: string
}

const KEY = "ring-of-lagos:v1"

export const DEFAULT_PROGRESS: Progress = {
  careerStage: 0,
  fighterId: "lekki_smooth",
  muted: false,
  tutorialSeen: false,
  dailyBest: null,
  difficulty: "normal",
  custom: {},
  belts: [],
  dailyWins: 0,
  pvp: { wins: 0, losses: 0 },
  coachId: "bayo",
}

export function loadProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PROGRESS
    return { ...DEFAULT_PROGRESS, ...(JSON.parse(raw) as Partial<Progress>) }
  } catch {
    return DEFAULT_PROGRESS
  }
}

export function saveProgress(p: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Storage can be blocked inside sandboxed frames; the game still works for this session.
  }
}
