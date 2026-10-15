import type { HairStyle, Look, Tattoo } from "./avatar3d"

/** What a player can change on their own fighter. Anything left out keeps the fighter's default. */
export interface Custom {
  hair?: HairStyle
  hairColor?: string
  tipColor?: string | null
  beard?: Look["beard"]
  chest?: Tattoo | null
  back?: Tattoo | null
  armL?: Tattoo | null
  armR?: Tattoo | null
  leg?: Tattoo | null
  trunks?: string
  accent?: string
  shoes?: string
  chain?: string | null
  earrings?: boolean
}

export const HAIR_OPTIONS: { id: HairStyle; label: string }[] = [
  { id: "lowcut", label: "Low cut" },
  { id: "fade", label: "Fade" },
  { id: "afro", label: "Afro" },
  { id: "locs", label: "Locs" },
  { id: "braids", label: "Braids" },
  { id: "cornrows", label: "Cornrows" },
  { id: "hightop", label: "High-top" },
  { id: "twists", label: "Twists" },
  { id: "bun", label: "Bun" },
  { id: "bald", label: "Bald" },
]

export const HAIR_COLOURS = ["#120c09", "#3a2414", "#7a4a2c", "#f2efe8"]
export const DYE_OPTIONS: (string | null)[] = [null, "#e0457b", "#ff4d3d", "#f5c400", "#8b4dff", "#22c3b5", "#f2efe8"]

export const BEARD_OPTIONS: { id: Look["beard"]; label: string }[] = [
  { id: "none", label: "Clean" },
  { id: "stubble", label: "Stubble" },
  { id: "goatee", label: "Goatee" },
  { id: "full", label: "Full beard" },
]

export const TATTOO_OPTIONS: { id: Tattoo | null; label: string }[] = [
  { id: null, label: "None" },
  { id: "tribal", label: "Tribal" },
  { id: "sun", label: "Sun" },
  { id: "stars", label: "Stars" },
  { id: "script", label: "Script" },
  { id: "wings", label: "Wings" },
  { id: "rose", label: "Rose" },
  { id: "lattice", label: "Lattice" },
]

export const ARM_TATTOO_OPTIONS: { id: Tattoo | null; label: string }[] = [
  { id: null, label: "None" },
  { id: "sleeve", label: "Full sleeve" },
  { id: "band", label: "Band" },
  { id: "tribal", label: "Tribal" },
  { id: "stars", label: "Stars" },
  { id: "script", label: "Script" },
  { id: "rose", label: "Rose" },
]

export const KIT_COLOURS = ["#14101f", "#ffffff", "#ff4d3d", "#1fb86a", "#3a86ff", "#f5c400", "#e0457b", "#8b4dff", "#f08a24", "#22c3b5"]
export const CHAIN_OPTIONS: (string | null)[] = [null, "#f5c400", "#d8d6d0"]

/** Layers a player's choices over a fighter's default look. */
export function applyCustom(look: Look, c: Custom | undefined): Look {
  if (!c) return look
  const pick = <T,>(v: T | undefined, d: T) => (v === undefined ? d : v)
  return {
    ...look,
    hair: pick(c.hair, look.hair),
    hairColor: pick(c.hairColor, look.hairColor),
    tipColor: pick(c.tipColor, look.tipColor),
    beard: look.sex === "f" ? "none" : pick(c.beard, look.beard),
    bottomColor: pick(c.trunks, look.bottomColor),
    accent: pick(c.accent, look.accent),
    topColor: look.sex === "f" ? pick(c.accent, look.topColor) : look.topColor,
    shoes: pick(c.shoes, look.shoes),
    chain: pick(c.chain, look.chain),
    earrings: pick(c.earrings, look.earrings),
    tattoos: {
      chest: pick(c.chest, look.tattoos.chest),
      back: pick(c.back, look.tattoos.back),
      armL: pick(c.armL, look.tattoos.armL),
      armR: pick(c.armR, look.tattoos.armR),
      leg: pick(c.leg, look.tattoos.leg),
    },
  }
}

/** Keeps only known fields with sane values, for anything that arrives over the network. */
export function sanitizeCustom(raw: unknown): Custom | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const colour = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined)
  const oneOf = <T extends string>(v: unknown, list: readonly (T | null)[]) => (list.includes(v as T) ? (v as T | null) : undefined)
  const tattoos = [...TATTOO_OPTIONS, ...ARM_TATTOO_OPTIONS].map((o) => o.id)
  const out: Custom = {
    hair: oneOf(r.hair, HAIR_OPTIONS.map((o) => o.id)) ?? undefined,
    hairColor: colour(r.hairColor),
    tipColor: r.tipColor === null ? null : colour(r.tipColor),
    beard: oneOf(r.beard, BEARD_OPTIONS.map((o) => o.id)) ?? undefined,
    chest: oneOf(r.chest, tattoos),
    back: oneOf(r.back, tattoos),
    armL: oneOf(r.armL, tattoos),
    armR: oneOf(r.armR, tattoos),
    leg: oneOf(r.leg, tattoos),
    trunks: colour(r.trunks),
    accent: colour(r.accent),
    shoes: colour(r.shoes),
    chain: r.chain === null ? null : colour(r.chain),
    earrings: typeof r.earrings === "boolean" ? r.earrings : undefined,
  }
  return out
}
