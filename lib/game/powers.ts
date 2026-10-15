import type { Genre } from "./fighters"

/** Visual family of a superpower. The scene draws each one differently. */
export type PowerKind = "fire" | "lightning" | "ice" | "quake" | "chain" | "teleport" | "sound" | "spirit"

export interface PowerDef {
  kind: PowerKind
  name: string
  damage: number
  color: string
  glow: string
  /** Short line shown under the name, Mortal Kombat style. */
  tagline: string
}

const KINDS: Record<PowerKind, { color: string; glow: string; tagline: string }> = {
  fire: { color: "#ff6a1a", glow: "#ffd23f", tagline: "Pepper soup fireball" },
  lightning: { color: "#7fd8ff", glow: "#ffffff", tagline: "NEPA no fit hold am" },
  ice: { color: "#9ff3ff", glow: "#e8fdff", tagline: "Harmattan freeze" },
  quake: { color: "#c98a3d", glow: "#ffd28a", tagline: "Ground shake" },
  chain: { color: "#d8d6d0", glow: "#f5c400", tagline: "Come here!" },
  teleport: { color: "#8b4dff", glow: "#e0b8ff", tagline: "Now you see me" },
  sound: { color: "#f5c400", glow: "#ffffff", tagline: "Speaker blast" },
  spirit: { color: "#1fb86a", glow: "#b8ffd8", tagline: "Ancestors are watching" },
}

const BY_GENRE: Record<Genre, PowerKind[]> = {
  afrobeats: ["fire", "lightning", "teleport", "sound"],
  streethop: ["chain", "lightning", "fire", "teleport"],
  fuji: ["quake", "spirit", "sound"],
  amapiano: ["sound", "ice", "teleport"],
  highlife: ["spirit", "ice", "quake"],
}

function hash(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Every fighter (and CPU opponent) gets a superpower picked from their genre, fixed by their id. */
export function powerFor(id: string, genre: Genre, signature: { name: string; damage: number }): PowerDef {
  const kinds = BY_GENRE[genre]
  const kind = kinds[hash(id.replace(/_cpu$/, "")) % kinds.length]
  return { kind, name: signature.name, damage: signature.damage, ...KINDS[kind] }
}

/** Inputs that make up a combo: punches, dodges and side-steps. */
export type ComboInput = "L" | "R" | "U" | "D" | "<" | ">"

export interface ComboDef {
  id: string
  name: string
  seq: ComboInput[]
  /** Extra damage added to the punch that completes the combo. */
  bonus: number
  color: string
}

/** Mortal Kombat style strings. All inputs must land within the combo window, punches on the beat. */
export const COMBOS: ComboDef[] = [
  { id: "danfo", name: "Danfo Rush", seq: ["L", "L", "R"], bonus: 7, color: "#f5c400" },
  { id: "mainland", name: "Third Mainland", seq: ["L", "R", "L", "R"], bonus: 12, color: "#22c3b5" },
  { id: "agbero", name: "Agbero Flurry", seq: ["R", "R", "R", "R"], bonus: 11, color: "#ff4d3d" },
  { id: "okada", name: "Okada Swerve", seq: ["U", "R"], bonus: 9, color: "#8b4dff" },
  { id: "gutter", name: "Gutter Hook", seq: ["D", "L"], bonus: 9, color: "#1fb86a" },
  { id: "sidestep", name: "Area Sidestep", seq: [">", "L", "R"], bonus: 10, color: "#e0457b" },
  { id: "corner", name: "Corner Trap", seq: ["<", "R", "L"], bonus: 10, color: "#f08a24" },
]

/** Seconds allowed between the inputs of one combo. */
export const COMBO_WINDOW = 1.1

export function matchCombo(history: { input: ComboInput; t: number; onBeat: boolean }[], now: number): ComboDef | null {
  for (const c of [...COMBOS].sort((a, b) => b.seq.length - a.seq.length)) {
    const n = c.seq.length
    if (history.length < n) continue
    const tail = history.slice(-n)
    if (now - tail[0].t > COMBO_WINDOW * n) continue
    let ok = true
    for (let i = 0; i < n; i++) {
      const h = tail[i]
      if (h.input !== c.seq[i]) ok = false
      const punch = h.input === "L" || h.input === "R"
      if (punch && !h.onBeat) ok = false
      if (i > 0 && h.t - tail[i - 1].t > COMBO_WINDOW) ok = false
    }
    if (ok) return c
  }
  return null
}
