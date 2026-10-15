import { refereeLook, type Look } from "./avatar3d"
import type { OpponentDef } from "./fighters"

export type CoachPerk = "heal" | "vibe" | "chin"

export interface CoachDef {
  id: string
  name: string
  title: string
  bio: string
  perk: CoachPerk
  /** What the perk does, shown in the locker room. */
  perkText: string
  /** Career fights won before this coach will train you. */
  unlockStage: number
  look: Partial<Look>
}

/** Coach perks only apply in career fights, so the Daily Knockout and online fights stay level. */
export const COACHES: CoachDef[] = [
  {
    id: "bayo",
    name: "Coach Bayo",
    title: "Street veteran",
    bio: "Trained half of Mushin in a car park. Keeps ice, Vaseline and gist ready.",
    perk: "heal",
    perkText: "Patches you up: +10 HP between rounds",
    unlockStage: 0,
    look: { top: "tee", topColor: "#1fb86a", topColor2: "#1fb86a", bowTie: false, cap: "#f5c400", beard: "full", hair: "bald", bottom: "trousers", bottomColor: "#2b2733" },
  },
  {
    id: "ronke",
    name: "Aunty Ronke",
    title: "Rhythm queen",
    bio: "Former fuji dancer. Counts every beat out loud and never misses one.",
    perk: "vibe",
    perkText: "Hypes you up: start every round with 25% vibe",
    unlockStage: 2,
    look: { sex: "f", top: "kaftan", topColor: "#e0457b", topColor2: "#f5c400", bowTie: false, beard: "none", hair: "braids", gele: "#f5c400", earrings: true, bottom: "trousers", bottomColor: "#e0457b" },
  },
  {
    id: "fela",
    name: "Oga Fela",
    title: "Defence professor",
    bio: "Says nobody can hit what they cannot find. Has shades on at night.",
    perk: "chin",
    perkText: "Toughens you up: +12% max HP",
    unlockStage: 4,
    look: { top: "suit", topColor: "#14101f", topColor2: "#14101f", bowTie: false, tie: "#ff4d3d", shades: true, beard: "goatee", hair: "fade", chain: "#f5c400", bottom: "trousers", bottomColor: "#14101f" },
  },
]

export const DEFAULT_COACH = COACHES[0]

export function coachById(id: string | undefined | null) {
  return COACHES.find((c) => c.id === id) ?? DEFAULT_COACH
}

export function isCoachUnlocked(c: CoachDef, careerStage: number) {
  return careerStage >= c.unlockStage
}

export function coachLook(c: CoachDef): Look {
  return { ...refereeLook(), ...c.look }
}

/** The CPU corner's coach: an older trainer in the opponent's colours. */
export function cornerLook(colors: OpponentDef["colors"]): Look {
  return { ...refereeLook(), top: "tee", topColor: colors.trunks, topColor2: colors.trunks, bowTie: false, cap: colors.accent, hair: "lowcut", beard: "stubble", bottom: "trousers", bottomColor: "#2b2733" }
}

export interface RoundStats {
  onBeat: number
  offBeat: number
  landed: number
  perfectDodges: number
  damageDealt: number
  damageTaken: number
}

/** What your coach shouts in the corner after a round, from how the round went. */
export function coachTip(r: RoundStats, s: { playerHpPct: number; oppHpPct: number; vibe: number; finalNext: boolean }) {
  const swings = r.onBeat + r.offBeat
  if (s.vibe >= 100) return "Your vibe is full! Fire that special as soon as the bell goes."
  if (s.oppHpPct < 0.3) return "Oya, they're finished! Stay on the beat and close the show."
  if (s.playerHpPct < 0.3) return "Hands up, abeg! Hold to block, but slip the red uppercuts."
  if (swings >= 4 && r.onBeat / swings < 0.5) return "You're rushing. Wait for the dots to meet the ring, then punch."
  if (swings < 4) return "You're too shy! Throw on the beat, they can't hit you if they're blocking."
  if (r.damageTaken > r.damageDealt && r.perfectDodges === 0) return "Watch their glove glow, then swipe to slip. Counters hit harder."
  if (s.finalNext) return "Last round. Leave everything in this ring!"
  return "Na so! Same again, stay sharp on the beat."
}

/** The game plan your coach gives in the locker room before the walk-out. */
export function gamePlan(o: OpponentDef) {
  const counts = { jab: 0, hook: 0, uppercut: 0 }
  for (const a of o.pattern) counts[a]++
  const tips: string[] = []
  if (counts.uppercut >= counts.jab && counts.uppercut > 0) tips.push("They love the uppercut. Your block won't stop it: duck or slip the red glow.")
  else if (counts.hook > counts.jab) tips.push("Big looping hooks. Slip them and counter while they're open.")
  else tips.push("Lots of quick jabs. Keep your guard up and punch back on the beat.")
  if (o.guard > 0.5) tips.push("Tight guard: off-beat punches won't get through.")
  if (o.counter > 0.4) tips.push("They counter wild swings. Only punch on the beat.")
  if (o.bpm >= 120) tips.push(`Fast music at ${o.bpm} BPM. Stay calm, short taps.`)
  else if (o.bpm <= 95) tips.push(`Slow groove at ${o.bpm} BPM. Wait for each beat.`)
  return tips.slice(0, 3)
}
