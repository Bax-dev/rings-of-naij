import type { OpponentDef } from "./fighters"

export type Difficulty = "easy" | "normal" | "hard"

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Slower tells, softer hits" },
  { id: "normal", label: "Normal", blurb: "The real Lagos" },
  { id: "hard", label: "Hard", blurb: "They dodge, counter and use powers often" },
]

/** Tunes a CPU opponent for the chosen difficulty. */
export function scaleOpponent(o: OpponentDef, d: Difficulty): OpponentDef {
  if (d === "normal") return o
  if (d === "easy") {
    return { ...o, difficulty: Math.max(0, o.difficulty - 0.3), hp: Math.round(o.hp * 0.85), power: o.power * 0.75, guard: o.guard * 0.6, counter: o.counter * 0.4 }
  }
  return {
    ...o,
    difficulty: Math.min(1, o.difficulty + 0.25),
    hp: Math.round(o.hp * 1.2),
    power: o.power * 1.25,
    guard: Math.min(0.7, o.guard + 0.15),
    counter: Math.min(0.6, o.counter + 0.15),
  }
}

export interface BeltDef {
  id: string
  name: string
  how: string
  /** Plate colour and strap colour. */
  plate: string
  strap: string
  rank: number
}

export const BELTS: BeltDef[] = [
  { id: "career_easy", name: "Eko Street Belt", how: "Beat King Eko on Easy", plate: "#c98a3d", strap: "#7a1f2b", rank: 1 },
  { id: "career_normal", name: "Lagos Heavyweight Belt", how: "Beat King Eko on Normal", plate: "#d8d6d0", strap: "#14101f", rank: 3 },
  { id: "career_hard", name: "Undisputed Naija Belt", how: "Beat King Eko on Hard", plate: "#f5c400", strap: "#1fb86a", rank: 6 },
  { id: "daily_3", name: "Daily Don Belt", how: "Win 3 Daily Knockouts", plate: "#22c3b5", strap: "#14101f", rank: 2 },
  { id: "flawless", name: "No Scratch Belt", how: "Win a fight without taking damage", plate: "#ffffff", strap: "#3a86ff", rank: 4 },
  { id: "pvp_3", name: "Area Champion Belt", how: "Win 3 online fights", plate: "#c98a3d", strap: "#ff4d3d", rank: 2 },
  { id: "pvp_10", name: "Street King Belt", how: "Win 10 online fights", plate: "#d8d6d0", strap: "#8b4dff", rank: 5 },
  { id: "pvp_25", name: "Odogwu Belt", how: "Win 25 online fights", plate: "#f5c400", strap: "#e0457b", rank: 7 },
]

export function beltById(id: string | null | undefined) {
  return BELTS.find((b) => b.id === id) ?? null
}

/** The most prestigious belt among those held, which the fighter wears into the ring. */
export function bestBelt(held: readonly string[]) {
  return held
    .map(beltById)
    .filter((b): b is BeltDef => !!b)
    .sort((a, b) => b.rank - a.rank)[0] ?? null
}
