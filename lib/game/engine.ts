import { audio } from "./audio"
import type { Difficulty } from "./belts"
import { coachTip, type CoachDef, type RoundStats } from "./coaches"
import type { Custom } from "./customize"
import type { AttackType, FighterDef, OpponentDef } from "./fighters"
import type { NetEvent, NetLink } from "./net-types"
import { matchCombo, powerFor, type ComboDef, type ComboInput, type PowerDef, type PowerKind } from "./powers"
import { Renderer } from "./render"

export interface Cosmetics {
  goldGloves: boolean
  ankaraTrunks: boolean
  talkingDrumEntrance: boolean
}

export type FightMode = "cpu" | "pvp" | "watch"

export interface FightConfig {
  fighter: FighterDef
  opponent: OpponentDef
  cosmetics: Cosmetics
  mode?: FightMode
  difficulty?: Difficulty
  playerCustom?: Custom
  oppCustom?: Custom
  playerBelt?: string | null
  oppBelt?: string | null
  /** Online fights: the other player's fighter, for their stats and superpower. */
  oppFighter?: FighterDef
  playerName?: string
  oppName?: string
  net?: NetLink
  /** Your corner. Its perk only counts when coachPerks is on (career fights). */
  coach?: CoachDef
  coachPerks?: boolean
}

export type Phase = "entrance" | "faceoff" | "intro" | "fight" | "break" | "over"

export interface HudState {
  phase: Phase
  round: number
  timeLeft: number
  playerHp: number
  playerMax: number
  oppHp: number
  oppMax: number
  vibe: number
  oppVibe: number
  combo: number
  watchers: number
  mode: FightMode
  /** What your coach says in the corner between rounds. */
  coachTip: string | null
  /** CPU fights: the walk-out, face-off and corner breaks can be skipped with a tap. */
  skippable: boolean
}

export interface FightResult {
  won: boolean
  ko: boolean
  score: number
  onBeat: number
  offBeat: number
  landed: number
  maxCombo: number
  perfectDodges: number
  damageDealt: number
  damageTaken: number
  roundsFought: number
  flawless: boolean
  combos: number
  finisher: "power" | "combo" | null
  mode: FightMode
}

interface Callbacks {
  onHud: (hud: HudState) => void
  onEnd: (result: FightResult) => void
}

export type OppState = "idle" | "windup" | "strike" | "recover" | "stagger"
export type PlayerAction =
  | "idle"
  | "punchL"
  | "punchR"
  | "windupL"
  | "windupR"
  | "dodgeUp"
  | "dodgeDown"
  | "block"
  | "hit"
  | "special"
  | "charge"
export type Side = "player" | "opp"

export interface Popup {
  text: string
  x: number
  y: number
  born: number
  color: string
  size: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  color: string
}

/** Something the 3D scene should play: a superpower, a combo trail, a knockout cinematic. */
export interface FxEvent {
  kind: "power" | "combo" | "ko" | "finish" | "flash"
  side: Side
  t: number
  power?: PowerDef
  combo?: ComboDef
}

const ROUND_SECONDS = 30
const ROUNDS = 3
/** Online fights keep the short shared timetable: a crane shot, then the face-off. */
const ENTRANCE_SECONDS = 3.6
const NET_FACEOFF_AT = 2
/** CPU fights: each fighter walks out to the ring, the opponent first. */
const WALK_SECONDS = 3.4
const FACEOFF_SECONDS = 3.2
const INTRO_SECONDS = 2
const BREAK_SECONDS = 2.4
const CPU_BREAK_SECONDS = 5
/** Forgiving beat window either side of the beat, in seconds. */
const BEAT_WINDOW = 0.13
const TAP_MAX = 0.2
/** Full punch animation length, and when in it the glove reaches the opponent. */
export const PUNCH_TIME = 0.2
export const PUNCH_CONTACT = 0.085
/** Special move animation length, and when in it the power lands. */
export const SPECIAL_TIME = 1.1
export const SPECIAL_CONTACT = 0.45
const SWIPE_MIN = 34
/** Online punches wind up for at least this long, so the other player can see them coming. */
const NET_MIN_WINDUP = 0.32

const ATTACKS: Record<AttackType, { windup: number; damage: number; blockFactor: number; color: string }> = {
  jab: { windup: 0.55, damage: 6, blockFactor: 0.15, color: "#f5c400" },
  hook: { windup: 0.75, damage: 9, blockFactor: 0.2, color: "#ff8a3d" },
  uppercut: { windup: 0.95, damage: 13, blockFactor: 0.5, color: "#ff4d3d" },
}

const CPU_POWER_NAMES: Record<PowerKind, string> = {
  fire: "Pepper Blast",
  lightning: "NEPA Strike",
  ice: "Harmattan Freeze",
  quake: "Ground Shake",
  chain: "Come Here!",
  teleport: "Vanishing Act",
  sound: "Speaker Blast",
  spirit: "Ancestral Fury",
}

interface PointerTrack {
  x: number
  y: number
  downT: number
  blocking: boolean
}

type OppAttack = AttackType | "power"

export class FightEngine {
  readonly config: FightConfig
  readonly mode: FightMode
  readonly beatInterval: number
  readonly playerPower: PowerDef
  readonly oppPower: PowerDef
  private cb: Callbacks
  private canvas: HTMLCanvasElement
  private renderer: Renderer
  private net: NetLink | null
  private raf = 0
  private lastTs: number | null = null
  private hudTimer = 0
  private nextStep = 0
  private destroyed = false
  private finished = false
  paused = false

  /** Game clock in seconds. In CPU fights it only advances while running; online it follows the shared match clock. */
  t = 0
  /** CPU fights slow down for knockouts and finishers. */
  timeScale = 1
  phase: Phase = "entrance"
  phaseStart = 0
  phaseEnd = 0
  /** CPU walk-outs: when each fighter leaves the tunnel and reaches their corner. Online fights have none. */
  walk: { opp: [number, number]; player: [number, number] } | null = null
  coachTip: string | null = null
  private playerWalkShown = false
  private roundStats: RoundStats = { onBeat: 0, offBeat: 0, landed: 0, perfectDodges: 0, damageDealt: 0, damageTaken: 0 }
  round = 1
  roundTimeLeft = ROUND_SECONDS
  banner: { text: string; sub?: string; born: number; color: string; big?: boolean } | null = null

  player = {
    hp: 100,
    max: 100,
    vibe: 0,
    action: "idle" as PlayerAction,
    actionStart: 0,
    actionEnd: 0,
    cooldownUntil: 0,
    dodgeUntil: 0,
    counterUntil: 0,
    blocking: false,
    combo: 0,
    hitFlash: -10,
    hitSide: 1 as 1 | -1,
    /** Whether the punch currently being thrown will land on the opponent's guard. */
    punchBlocked: false,
    frozenUntil: -10,
    stepAt: -10,
    stepDir: 1 as 1 | -1,
    guardFlash: -10,
  }

  opp = {
    hp: 100,
    max: 100,
    vibe: 0,
    state: "idle" as OppState,
    stateStart: 0,
    stateEnd: 0,
    nextAttackAt: 3,
    attack: "jab" as OppAttack,
    side: 1 as 1 | -1,
    patternIndex: 0,
    hitFlash: -10,
    hitSide: 1 as 1 | -1,
    /** When the opponent last caught a punch on their gloves. */
    guardFlash: -10,
    dodgeUntil: -10,
    dodgeDir: "up" as "up" | "down",
    blocking: false,
    frozenUntil: -10,
    stepAt: -10,
    stepDir: 1 as 1 | -1,
    /** Online: the id and damage of the strike being wound up. */
    atkId: 0,
    atkDmg: 0,
  }

  /** Where the fighters stand. The 3D scene places them from this. */
  arena = { angle: 0, angleTarget: 0, cx: 0, cz: 0, dist: 1.1, playerPush: 0, oppPush: 0 }

  /** A thrown punch whose effects wait until the glove actually reaches the opponent. */
  pendingHit: {
    at: number
    side: "L" | "R"
    onBeat: boolean
    dmg: number
    blocked: boolean
    interrupt: boolean
    counter: boolean
    dodged: boolean
    combo: ComboDef | null
  } | null = null

  /** Online: my wound-up punch or power, waiting for its beat. */
  private pendingAtk: { id: number; at: number; side: "L" | "R"; power: boolean; combo: ComboDef | null; sent: boolean } | null = null
  /** Online: strikes from the other player still to land on me. */
  private incoming: { id: number; at: number; dmg: number; type: OppAttack }[] = []
  private dodgeLog: [number, number][] = []
  private blockLog: [number, number][] = []
  private atkSeq = 0
  private history: { input: ComboInput; t: number; onBeat: boolean }[] = []
  private finishShown = false
  private lastFinisher: "power" | "combo" | null = null
  private oppAliveCheckedAt = 0
  watchers = 0

  special = { active: false, start: 0, applied: false }
  /** The opponent's superpower in flight (CPU or online), for the scene's effects. */
  oppSpecial = { active: false, start: 0 }
  shake = { until: 0, power: 0 }
  popups: Popup[] = []
  particles: Particle[] = []
  fx: FxEvent[] = []
  cine: { kind: "power" | "ko" | "combo"; side: Side; start: number; until: number } | null = null

  stats = { onBeat: 0, offBeat: 0, landed: 0, maxCombo: 0, perfectDodges: 0, damageDealt: 0, damageTaken: 0, combos: 0 }

  private pointers = new Map<number, PointerTrack>()

  constructor(canvas: HTMLCanvasElement, config: FightConfig, cb: Callbacks) {
    this.canvas = canvas
    this.config = config
    this.mode = config.mode ?? "cpu"
    this.net = this.mode === "cpu" ? null : (config.net ?? null)
    this.cb = cb
    this.beatInterval = 60 / config.opponent.bpm
    const f = config.fighter
    this.playerPower = powerFor(f.id, f.genre, f.signature)
    const of = config.oppFighter
    if (of) {
      this.oppPower = powerFor(of.id, of.genre, of.signature)
      this.opp.hp = this.opp.max = of.maxHp
    } else {
      const o = config.opponent
      const base = powerFor(o.id, o.genre, { name: "", damage: Math.round(18 + o.difficulty * 12) })
      this.oppPower = { ...base, name: CPU_POWER_NAMES[base.kind] }
      this.opp.hp = this.opp.max = o.hp
    }
    this.player.hp = this.player.max = f.maxHp
    if (this.perk === "chin") this.player.hp = this.player.max = Math.round(f.maxHp * 1.12)
    this.renderer = new Renderer(canvas, this)

    if (this.mode !== "watch") {
      canvas.addEventListener("pointerdown", this.onPointerDown)
      canvas.addEventListener("pointerup", this.onPointerUp)
      canvas.addEventListener("pointercancel", this.onPointerCancel)
      window.addEventListener("keydown", this.onKeyDown)
      window.addEventListener("keyup", this.onKeyUp)
    }
  }

  get playerName() {
    return this.config.playerName ?? this.config.fighter.name
  }

  get oppName() {
    return this.config.oppName ?? this.config.opponent.name
  }

  /** The coach's perk, in fights where perks count. */
  private get perk() {
    return this.mode === "cpu" && this.config.coachPerks ? (this.config.coach?.perk ?? null) : null
  }

  start() {
    if (this.mode === "cpu") {
      this.walk = { opp: [0.2, 0.2 + WALK_SECONDS], player: [WALK_SECONDS + 0.4, WALK_SECONDS * 2 + 0.4] }
      this.setPhase("entrance", WALK_SECONDS * 2 + 0.8)
      this.showBanner(this.oppName, this.config.opponent.title, "#ff4d3d")
    } else if (this.config.cosmetics.talkingDrumEntrance) audio.talkingDrumIntro()
    this.loop(performance.now())
  }

  /** Taps skip the walk-out, the face-off and the corner break in CPU fights. */
  skip() {
    if (this.mode !== "cpu" || this.paused) return
    if (this.phase === "entrance") this.beginFaceoff()
    else if (this.phase === "faceoff") this.beginRoundIntro()
    else if (this.phase === "break" && this.t - this.phaseStart > 1) {
      this.round++
      this.beginRoundIntro()
    }
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener("pointerdown", this.onPointerDown)
    this.canvas.removeEventListener("pointerup", this.onPointerUp)
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel)
    window.removeEventListener("keydown", this.onKeyDown)
    window.removeEventListener("keyup", this.onKeyUp)
    this.renderer.destroy()
  }

  setPaused(paused: boolean) {
    if (this.destroyed || paused === this.paused) return
    this.paused = paused
    if (paused) {
      cancelAnimationFrame(this.raf)
      this.pointers.clear()
      if (this.player.blocking) this.setBlock(false)
      audio.suspend()
    } else {
      audio.resume()
      this.lastTs = null
      this.raf = requestAnimationFrame(this.loop)
    }
  }

  resize() {
    this.renderer.resize()
    this.renderer.draw()
  }

  // ---------- rhythm ----------

  beatPhase(t = this.t) {
    return (((t / this.beatInterval) % 1) + 1) % 1
  }

  isOnBeat(t: number) {
    const ph = this.beatPhase(t)
    return Math.min(ph, 1 - ph) * this.beatInterval <= BEAT_WINDOW
  }

  nextBeatAfter(t: number) {
    return Math.ceil(t / this.beatInterval) * this.beatInterval
  }

  // ---------- loop ----------

  private loop = (ts: number) => {
    if (this.destroyed || this.paused) return
    const dt = this.lastTs === null ? 0 : Math.min(0.05, (ts - this.lastTs) / 1000)
    this.lastTs = ts
    this.update(dt)
    if (this.destroyed) return
    this.renderer.draw()
    this.raf = requestAnimationFrame(this.loop)
  }

  private update(realDt: number) {
    let dt: number
    if (this.net) {
      const now = this.mode === "watch" ? this.net.clock() - 1.2 : this.net.clock()
      dt = Math.max(0, Math.min(0.25, now - this.t))
      this.t = Math.max(this.t, now)
      this.followSchedule()
    } else {
      this.timeScale = Math.min(1, this.timeScale + realDt * 0.9)
      dt = realDt * this.timeScale
      this.t += dt
    }
    const t = this.t
    this.scheduleMusic()

    if (this.net) this.pumpNet()

    if (this.phase === "fight") {
      if (!this.net && !this.special.active) this.roundTimeLeft = Math.max(0, this.roundTimeLeft - dt)
      this.updateHolds()
      this.updatePlayer()
      this.updatePendingHit()
      this.updatePendingAtk()
      this.updateIncoming()
      if (this.mode === "cpu") this.updateOpponent()
      else this.updateRemoteOpp()
      this.updateSpecial()
      this.checkFinisher()
      if (!this.net && this.phase === "fight" && this.roundTimeLeft <= 0) this.endRound()
    } else if (!this.net && t >= this.phaseEnd) {
      if (this.phase === "entrance") this.beginFaceoff()
      else if (this.phase === "faceoff") this.beginRoundIntro()
      else if (this.phase === "intro") this.beginFight()
      else if (this.phase === "break") {
        this.round++
        this.beginRoundIntro()
      } else if (this.phase === "over") this.finish()
    } else if (!this.net && this.phase === "entrance" && this.walk && t >= this.walk.player[0] && !this.playerWalkShown) {
      this.playerWalkShown = true
      this.showBanner(this.playerName, this.config.fighter.style, "#f5c400")
      if (this.config.cosmetics.talkingDrumEntrance) audio.talkingDrumIntro()
    } else if (!this.net && this.phase === "intro" && t >= this.phaseEnd - 0.7 && this.banner?.text !== "FIGHT!") {
      this.showBanner("FIGHT!", undefined, "#f5c400")
      audio.sfx("bell")
    }

    if (this.phase === "over" && this.net && t >= this.phaseEnd) this.finish()

    const p = this.player
    if (p.action !== "idle" && p.action !== "block" && p.action !== "windupL" && p.action !== "windupR" && p.action !== "charge" && t >= p.actionEnd) {
      p.action = p.blocking ? "block" : "idle"
    }

    this.updateArena(dt)

    this.popups = this.popups.filter((q) => t - q.born < 0.9)
    this.particles = this.particles.filter((q) => t - q.born < q.life)
    this.fx = this.fx.filter((f) => t - f.t < 4)
    if (this.cine && t > this.cine.until) this.cine = null
    for (const q of this.particles) {
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vy += 600 * dt
    }

    this.hudTimer -= realDt
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1
      this.emitHud()
    }
  }

  private scheduleMusic() {
    if (!audio.ready || this.phase === "over") return
    const step = this.beatInterval / 2
    const lookAhead = 0.15
    if (this.nextStep * step < this.t) this.nextStep = Math.ceil(this.t / step)
    while (this.nextStep * step < this.t + lookAhead) {
      const when = audio.now + (this.nextStep * step - this.t)
      audio.playStep(this.config.opponent.genre, this.nextStep, when)
      this.nextStep++
    }
  }

  emitHud() {
    this.cb.onHud({
      phase: this.phase,
      round: this.round,
      timeLeft: Math.ceil(this.roundTimeLeft),
      playerHp: Math.max(0, Math.round(this.player.hp)),
      playerMax: this.player.max,
      oppHp: Math.max(0, Math.round(this.opp.hp)),
      oppMax: this.opp.max,
      vibe: Math.round(this.player.vibe),
      oppVibe: Math.round(this.opp.vibe),
      combo: this.player.combo,
      watchers: this.watchers,
      mode: this.mode,
      coachTip: this.coachTip,
      skippable: this.mode === "cpu" && (this.phase === "entrance" || this.phase === "faceoff" || (this.phase === "break" && this.t - this.phaseStart > 1)),
    })
  }

  // ---------- arena ----------

  private updateArena(dt: number) {
    const a = this.arena
    const t = this.t
    // The pair drifts around the ring and slowly circles, like real footwork.
    a.cx = Math.sin(t * 0.19) * 0.55
    a.cz = Math.sin(t * 0.15 + 1.3) * 0.4
    a.angleTarget += Math.sin(t * 0.37) * 0.04 * dt
    a.angle += (a.angleTarget - a.angle) * Math.min(1, dt * 6)
    const decay = Math.exp(-dt * 3)
    a.playerPush *= decay
    a.oppPush *= decay
    a.dist = 1.1 + Math.sin(t * 0.8) * 0.06
  }

  step(dir: 1 | -1) {
    const p = this.player
    if (this.mode === "watch" || this.phase !== "fight" || this.t < p.frozenUntil) return
    if (this.t - p.stepAt < 0.35 || p.action === "hit" || this.special.active) return
    p.stepAt = this.t
    p.stepDir = dir
    p.dodgeUntil = Math.max(p.dodgeUntil, this.t + 0.18)
    this.dodgeLog.push([this.t, this.t + 0.18])
    this.arena.angleTarget += dir * 0.45
    this.pushHistory(dir === 1 ? ">" : "<", true)
    audio.sfx("dodge")
    this.net?.send({ k: "step", dir, at: this.t })
  }

  // ---------- phases ----------

  private setPhase(phase: Phase, duration: number) {
    this.phase = phase
    this.phaseStart = this.t
    this.phaseEnd = this.t + duration
    this.emitHud()
  }

  private showBanner(text: string, sub: string | undefined, color: string, big = false) {
    this.banner = { text, sub, born: this.t, color, big }
  }

  private beginFaceoff() {
    this.playerWalkShown = true
    this.banner = null
    this.setPhase("faceoff", FACEOFF_SECONDS)
    audio.sfx("bell")
  }

  private beginRoundIntro() {
    this.roundTimeLeft = ROUND_SECONDS
    this.coachTip = null
    if (this.perk === "vibe") this.player.vibe = Math.max(this.player.vibe, 25)
    this.setPhase("intro", INTRO_SECONDS)
    const final = this.round === ROUNDS
    this.showBanner(final ? "FINAL ROUND" : `ROUND ${this.round}`, this.config.opponent.venue, "#ffffff")
  }

  private beginFight() {
    this.setPhase("fight", Number.POSITIVE_INFINITY)
    this.banner = null
    this.roundStats = this.snapshot()
    this.opp.state = "idle"
    this.opp.nextAttackAt = this.t + this.beatInterval * 3
  }

  /** Online fights run on a fixed timetable from the shared clock, so both phones agree on rounds. */
  private followSchedule() {
    if (this.phase === "over") return
    const t = this.t
    const prev = this.phase
    if (t < ENTRANCE_SECONDS) {
      this.phase = t < NET_FACEOFF_AT ? "entrance" : "faceoff"
      this.phaseStart = this.phase === "entrance" ? 0 : NET_FACEOFF_AT
      this.phaseEnd = this.phase === "entrance" ? NET_FACEOFF_AT : ENTRANCE_SECONDS
      if (this.phase === "entrance" && !this.banner) this.showBanner(`${this.playerName} vs ${this.oppName}`, this.config.opponent.venue, "#ffffff")
      if (this.phase === "faceoff") this.banner = null
      if (prev !== this.phase) this.emitHud()
      return
    }
    const roundLen = INTRO_SECONDS + ROUND_SECONDS + BREAK_SECONDS
    const k = t - ENTRANCE_SECONDS
    const round = Math.min(ROUNDS, Math.floor(k / roundLen) + 1)
    const into = k - (round - 1) * roundLen
    this.round = round
    if (into < INTRO_SECONDS) {
      this.phase = "intro"
      this.phaseEnd = t - into + INTRO_SECONDS
      this.roundTimeLeft = ROUND_SECONDS
      if (prev !== "intro") this.showBanner(round === ROUNDS ? "FINAL ROUND" : `ROUND ${round}`, this.config.opponent.venue, "#ffffff")
      if (into > INTRO_SECONDS - 0.7 && this.banner?.text !== "FIGHT!") {
        this.showBanner("FIGHT!", undefined, "#f5c400")
        audio.sfx("bell")
      }
    } else if (into < INTRO_SECONDS + ROUND_SECONDS) {
      this.phase = "fight"
      this.phaseEnd = Number.POSITIVE_INFINITY
      this.roundTimeLeft = INTRO_SECONDS + ROUND_SECONDS - into
      if (prev !== "fight") {
        this.banner = null
        this.coachTip = null
        this.roundStats = this.snapshot()
      }
    } else if (round < ROUNDS) {
      this.phase = "break"
      this.phaseEnd = t - into + roundLen
      this.roundTimeLeft = 0
      if (prev === "fight") {
        audio.sfx("bell")
        this.cornerTalk()
        this.showBanner(`END OF ROUND ${round}`, undefined, "#ffffff")
        this.player.action = "idle"
        if (this.player.blocking) this.setBlock(false)
      }
    } else {
      audio.sfx("bell")
      this.endMatch(false)
    }
    if (prev !== this.phase) this.emitHud()
  }

  private snapshot() {
    const { onBeat, offBeat, landed, perfectDodges, damageDealt, damageTaken } = this.stats
    return { onBeat, offBeat, landed, perfectDodges, damageDealt, damageTaken }
  }

  /** The corner: the coach's advice from this round, and the perk's patch-up. */
  private cornerTalk() {
    const st = this.stats
    const r0 = this.roundStats
    if (this.perk === "heal") this.player.hp = Math.min(this.player.max, this.player.hp + 10)
    this.coachTip = coachTip(
      {
        onBeat: st.onBeat - r0.onBeat,
        offBeat: st.offBeat - r0.offBeat,
        landed: st.landed - r0.landed,
        perfectDodges: st.perfectDodges - r0.perfectDodges,
        damageDealt: st.damageDealt - r0.damageDealt,
        damageTaken: st.damageTaken - r0.damageTaken,
      },
      { playerHpPct: this.player.hp / this.player.max, oppHpPct: this.opp.hp / this.opp.max, vibe: this.player.vibe, finalNext: this.round + 1 === ROUNDS },
    )
    this.roundStats = this.snapshot()
  }

  private endRound() {
    audio.sfx("bell")
    if (this.round >= ROUNDS) {
      this.endMatch(false)
    } else {
      this.cornerTalk()
      this.setPhase("break", CPU_BREAK_SECONDS)
      this.showBanner(`END OF ROUND ${this.round}`, undefined, "#ffffff")
      this.player.action = "idle"
      this.player.blocking = false
      this.opp.state = "idle"
    }
  }

  private endMatch(ko: boolean, reason?: "forfeit") {
    if (this.phase === "over") return
    this.forfeit = reason === "forfeit"
    const won = ko ? this.opp.hp <= 0 && this.player.hp > 0 : this.player.hp / this.player.max > this.opp.hp / this.opp.max
    this.matchKo = ko
    this.matchWon = won
    this.setPhase("over", ko ? 4.2 : 3.2)
    const flawless = won && this.stats.damageTaken < 0.5 && this.mode !== "watch"
    if (reason === "forfeit") {
      this.showBanner("OPPONENT LEFT", "You win", "#f5c400", true)
    } else if (this.mode === "watch") {
      const winner = won ? this.playerName : this.oppName
      this.showBanner(ko ? "K.O.!" : "DECISION", `${winner} wins`, "#f5c400", true)
    } else if (ko) {
      const title = won ? (this.lastFinisher === "power" ? "SUPER K.O.!" : this.lastFinisher === "combo" ? "COMBO K.O.!" : "K.O.!") : "K.O.!"
      this.showBanner(title, won ? (flawless ? "NO SCRATCH!" : "You win!") : "Knocked down", won ? "#f5c400" : "#ff4d3d", true)
    } else {
      this.showBanner("JUDGES' DECISION", won ? (flawless ? "NO SCRATCH!" : "You win on points!") : "They take it", won ? "#f5c400" : "#ff4d3d")
    }
    if (ko) {
      if (!this.net) this.timeScale = 0.25
      this.cine = { kind: "ko", side: won ? "opp" : "player", start: this.t, until: this.t + 3 }
      this.fx.push({ kind: "ko", side: won ? "opp" : "player", t: this.t })
      this.shake = { until: this.t + 0.5, power: 14 }
    }
    if (won || this.mode === "watch") audio.sfx("cheer")
    if (this.mode === "pvp" && ko && this.player.hp <= 0) this.net?.send({ k: "ko", at: this.t })
  }

  matchKo = false
  matchWon = false
  /** The other player left; a win, but not one that earns a no-damage belt. */
  forfeit = false

  private finish() {
    if (this.finished) return
    this.finished = true
    const s = this.stats
    const roundsFought = this.round
    const timeBonus = this.matchKo && this.matchWon ? Math.round((ROUNDS - this.round) * ROUND_SECONDS + this.roundTimeLeft) * 20 : 0
    const flawless = this.matchWon && s.damageTaken < 0.5 && !this.forfeit && this.stats.landed > 0
    const score = Math.max(
      0,
      Math.round(
        s.damageDealt * 10 +
          s.onBeat * 20 +
          s.maxCombo * 15 +
          s.perfectDodges * 30 +
          s.combos * 120 +
          (this.matchWon ? 1000 : 0) +
          (this.matchKo && this.matchWon ? 1500 : 0) +
          (flawless ? 2000 : 0) +
          timeBonus +
          Math.max(0, this.player.hp) * 8,
      ),
    )
    if (this.mode === "pvp") this.net?.report({ hp: Math.max(0, this.player.hp), oppHp: Math.max(0, this.opp.hp), ko: this.matchKo, won: this.matchWon })
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.cb.onEnd({
      won: this.matchWon,
      ko: this.matchKo,
      score,
      onBeat: s.onBeat,
      offBeat: s.offBeat,
      landed: s.landed,
      maxCombo: s.maxCombo,
      perfectDodges: s.perfectDodges,
      damageDealt: Math.round(s.damageDealt),
      damageTaken: Math.round(s.damageTaken),
      roundsFought,
      flawless,
      combos: s.combos,
      finisher: this.matchKo && this.matchWon ? this.lastFinisher : null,
      mode: this.mode,
    })
  }

  // ---------- player ----------

  private canAct() {
    const p = this.player
    return this.phase === "fight" && !this.special.active && this.t >= p.actionEnd - 0.02 && this.t >= p.frozenUntil && p.action !== "charge"
  }

  private pushHistory(input: ComboInput, onBeat: boolean) {
    this.history.push({ input, t: this.t, onBeat })
    if (this.history.length > 8) this.history.shift()
  }

  /** Checks the input history for a combo, and clears it when one is found. */
  private takeCombo() {
    const c = matchCombo(this.history, this.t)
    if (c) this.history = []
    return c
  }

  punch(side: "L" | "R", pressedAt = this.t) {
    const p = this.player
    const f = this.config.fighter
    if (this.mode === "watch" || this.phase !== "fight" || this.special.active || p.blocking) return
    if (this.t < p.cooldownUntil || p.action === "hit" || this.t < p.frozenUntil || p.action === "charge") return

    const onBeat = this.isOnBeat(pressedAt)
    if (onBeat) {
      this.stats.onBeat++
      p.combo++
      this.stats.maxCombo = Math.max(this.stats.maxCombo, p.combo)
    } else {
      this.stats.offBeat++
      p.combo = 0
    }
    this.pushHistory(side, onBeat)
    const combo = this.takeCombo()

    if (this.mode === "pvp") {
      if (this.pendingAtk) return
      const at = this.nextBeatAfter(this.t + NET_MIN_WINDUP)
      let dmg = 5.2 * f.power * (onBeat ? 1.6 : 1) + (combo?.bonus ?? 0)
      if (this.t < p.counterUntil) dmg *= f.counterBonus
      const id = ++this.atkSeq
      this.pendingAtk = { id, at, side, power: false, combo, sent: true }
      p.action = side === "L" ? "windupL" : "windupR"
      p.actionStart = this.t
      p.actionEnd = at - PUNCH_CONTACT
      p.cooldownUntil = at
      const type: AttackType = combo ? "uppercut" : onBeat ? "hook" : "jab"
      this.net?.send({ k: "atk", id, side: side === "L" ? -1 : 1, type, at, dmg: Math.round(dmg * 10) / 10, combo: combo?.name })
      return
    }

    p.action = side === "L" ? "punchL" : "punchR"
    p.actionStart = this.t
    p.actionEnd = this.t + PUNCH_TIME
    p.cooldownUntil = this.t + f.punchCooldown / 1000
    audio.sfx("whoosh")

    const o = this.opp
    const opp = this.config.opponent

    let mult = onBeat ? 1.6 : 1
    if (o.state === "recover" || o.state === "stagger") mult *= 1.35
    if (this.t < p.counterUntil) mult *= f.counterBonus

    // Reading the tell: an on-beat punch early in the wind-up interrupts the attack.
    let interrupt = false
    if (o.state === "windup" && onBeat && o.attack !== "power") {
      const progress = (this.t - o.stateStart) / (o.stateEnd - o.stateStart)
      if (progress < 0.7) {
        interrupt = true
        mult *= 1.2
      }
    }

    let blocked = false
    let counter = false
    let dodged = false
    const frozen = this.t < o.frozenUntil
    if (o.state === "idle" && !frozen) {
      // Harder opponents slip punches; on-beat ones are harder to read.
      const slip = Math.max(0, (opp.difficulty - 0.35) * 0.5) * (onBeat ? 0.4 : 1)
      if (!combo && Math.random() < slip) dodged = true
      else {
        const guardChance = onBeat ? opp.guard * 0.35 : opp.guard
        blocked = !combo && Math.random() < guardChance
        counter = !onBeat && !blocked && Math.random() < opp.counter
      }
    }
    if (dodged) {
      o.dodgeUntil = this.t + 0.4
      o.dodgeDir = Math.random() < 0.5 ? "up" : "down"
    }

    const dmg = (4.2 * f.power * mult + (combo?.bonus ?? 0)) * (blocked ? 0.2 : 1) * (frozen ? 1.3 : 1)
    p.punchBlocked = blocked
    this.pendingHit = { at: this.t + PUNCH_CONTACT, side, onBeat, dmg, blocked, interrupt, counter, dodged, combo }
  }

  /** Applies a punch the moment the glove connects, so damage and sparks match what you see. */
  private updatePendingHit() {
    const hit = this.pendingHit
    if (!hit || this.t < hit.at) return
    this.pendingHit = null
    const p = this.player
    const f = this.config.fighter
    const head = this.renderer.oppHead()
    const dir = hit.side === "L" ? -1 : 1
    const hitX = head.x + dir * 10
    const hitY = hit.blocked ? head.guardY : head.y

    if (hit.dodged) {
      this.popup("SLIPPED!", head.x, head.y - 40, "#22c3b5", 20)
      this.opp.vibe = Math.min(100, this.opp.vibe + 5)
      if (Math.random() < this.config.opponent.counter + 0.2) this.startAttack("jab", 0.3)
      return
    }
    if (hit.interrupt) {
      this.setOppState("stagger", 0.7)
      this.popup("INTERRUPT!", hitX, hitY - 40, "#1fb86a", 26)
    }
    if (hit.counter && this.opp.state === "idle") {
      this.startAttack("jab", 0.3)
      this.popup("COUNTER!", head.x, head.y - 70, "#ff4d3d", 24)
    }

    if (hit.blocked) this.opp.guardFlash = this.t
    if (hit.combo) this.playCombo(hit.combo, "player")
    this.lastFinisher = hit.combo ? "combo" : null
    this.damageOpponent(hit.dmg, dir)
    this.stats.landed += hit.blocked ? 0 : 1
    this.landedEffects(hit.blocked, hit.onBeat, hitX, hitY, f.colors.accent)
    if (!hit.blocked && hit.onBeat) {
      p.vibe = Math.min(100, p.vibe + 11 * f.vibeRate)
      this.popup(p.combo >= 3 ? `ON BEAT x${p.combo}` : "ON BEAT", hitX, hitY - 30, "#f5c400", 22)
    }
  }

  private landedEffects(blocked: boolean, big: boolean, x: number, y: number, accent: string) {
    if (blocked) {
      audio.sfx("blocked")
      this.burst(x, y, "#a9a4c4", 4)
      this.popup("BLOCKED", x, y - 20, "#a9a4c4", 18)
    } else {
      audio.sfx(big ? "hitBig" : "hit")
      this.shake = { until: this.t + (big ? 0.12 : 0.06), power: big ? 5 : 2.5 }
      this.burst(x, y, big ? accent : "#ffffff", big ? 12 : 6)
    }
  }

  private playCombo(c: ComboDef, side: Side) {
    this.stats.combos += side === "player" ? 1 : 0
    this.fx.push({ kind: "combo", side, t: this.t, combo: c })
    this.cine = { kind: "combo", side, start: this.t, until: this.t + 0.6 }
    this.showBanner(c.name.toUpperCase(), "Combo", c.color, true)
    audio.sfx("special")
    if (!this.net) this.timeScale = 0.55
  }

  /** Online: lets my wound-up punch or power land on its beat. */
  private updatePendingAtk() {
    const a = this.pendingAtk
    if (!a) return
    const p = this.player
    if (!a.power && this.t >= a.at - PUNCH_CONTACT && (p.action === "windupL" || p.action === "windupR")) {
      p.action = a.side === "L" ? "punchL" : "punchR"
      p.actionStart = a.at - PUNCH_CONTACT
      p.actionEnd = p.actionStart + PUNCH_TIME
      p.punchBlocked = this.opp.blocking
      audio.sfx("whoosh")
    }
    if (a.power && this.t >= a.at - SPECIAL_CONTACT && p.action === "charge") {
      p.action = "special"
      p.actionStart = a.at - SPECIAL_CONTACT
      p.actionEnd = p.actionStart + SPECIAL_TIME
      this.special = { active: true, start: p.actionStart, applied: true }
      this.fx.push({ kind: "power", side: "player", t: this.t, power: this.playerPower })
      this.cine = { kind: "power", side: "player", start: this.t, until: this.t + 1.1 }
    }
    if (this.t >= a.at + 1.5) this.pendingAtk = null
  }

  dodge(dir: "up" | "down") {
    const p = this.player
    if (this.mode === "watch" || !this.canAct() || p.blocking) return
    const dur = this.config.fighter.dodgeMs / 1000
    p.action = dir === "up" ? "dodgeUp" : "dodgeDown"
    p.actionStart = this.t
    p.actionEnd = this.t + dur
    p.dodgeUntil = this.t + dur
    this.dodgeLog.push([this.t, this.t + dur])
    this.pushHistory(dir === "up" ? "U" : "D", true)
    audio.sfx("dodge")
    this.net?.send({ k: "dodge", dir, from: this.t, until: this.t + dur })
  }

  setBlock(on: boolean) {
    const p = this.player
    if (this.mode === "watch") return
    if (on) {
      if (this.phase !== "fight" || this.special.active || p.action === "hit" || p.action === "charge" || p.blocking) return
      if (p.action === "windupL" || p.action === "windupR") return
      p.blocking = true
      p.action = "block"
      this.blockLog.push([this.t, Number.POSITIVE_INFINITY])
      this.net?.send({ k: "block", on: true, at: this.t })
    } else {
      if (!p.blocking) return
      p.blocking = false
      if (p.action === "block") p.action = "idle"
      const last = this.blockLog[this.blockLog.length - 1]
      if (last && last[1] === Number.POSITIVE_INFINITY) last[1] = this.t
      this.net?.send({ k: "block", on: false, at: this.t })
    }
  }

  triggerSpecial() {
    const p = this.player
    if (this.mode === "watch" || this.phase !== "fight" || p.vibe < 100 || this.special.active || this.pendingAtk) return
    if (this.t < p.frozenUntil) return
    p.vibe = 0
    if (p.blocking) this.setBlock(false)
    this.showBanner(this.playerPower.name.toUpperCase(), this.playerPower.tagline, this.playerPower.color, true)
    audio.sfx("special")

    if (this.mode === "pvp") {
      const at = this.nextBeatAfter(this.t + 0.9)
      const id = ++this.atkSeq
      this.pendingAtk = { id, at, side: "R", power: true, combo: null, sent: true }
      p.action = "charge"
      p.actionStart = this.t
      p.actionEnd = at
      this.net?.send({ k: "pow", id, at, dmg: this.playerPower.damage })
      return
    }

    p.action = "special"
    p.actionStart = this.t
    p.actionEnd = this.t + SPECIAL_TIME
    this.special = { active: true, start: this.t, applied: false }
    this.fx.push({ kind: "power", side: "player", t: this.t, power: this.playerPower })
    this.cine = { kind: "power", side: "player", start: this.t, until: this.t + SPECIAL_TIME }
  }

  private updateSpecial() {
    const s = this.special
    if (!s.active) return
    const elapsed = this.t - s.start
    if (!s.applied && elapsed >= SPECIAL_CONTACT) {
      s.applied = true
      const head = this.renderer.oppHead()
      const pw = this.playerPower
      this.lastFinisher = "power"
      this.damageOpponent(pw.damage, 1)
      this.stats.landed++
      this.applyPowerEffect(pw, "opp")
      this.shake = { until: this.t + 0.45, power: 12 }
      this.burst(head.x, head.y, pw.color, 30)
      this.popup(`-${pw.damage}`, head.x, head.y - 60, "#f5c400", 34)
      audio.sfx("hitBig")
    }
    if (elapsed >= SPECIAL_TIME) {
      s.active = false
      if (this.banner?.big && this.phase === "fight") this.banner = null
      if (this.player.action === "special") this.player.action = "idle"
    }
  }

  /** What a superpower does besides damage: freezes, pulls, knockback. */
  private applyPowerEffect(pw: PowerDef, target: Side) {
    const a = this.arena
    if (target === "opp") {
      if (pw.kind === "ice") this.opp.frozenUntil = this.t + 1.6
      if (this.mode === "cpu") this.setOppState("stagger", pw.kind === "ice" ? 1.6 : 1)
      if (pw.kind === "chain") a.oppPush -= 0.3
      if (pw.kind === "quake" || pw.kind === "sound" || pw.kind === "fire") a.oppPush += 0.45
    } else {
      if (pw.kind === "ice") this.player.frozenUntil = this.t + 1.0
      if (pw.kind === "chain") a.playerPush -= 0.3
      if (pw.kind === "quake" || pw.kind === "sound" || pw.kind === "fire") a.playerPush += 0.45
    }
  }

  private checkFinisher() {
    if (this.finishShown || this.mode === "watch") return
    if (this.opp.hp > 0 && this.opp.hp <= this.opp.max * 0.15) {
      this.finishShown = true
      this.showBanner("FINISH AM!", "End it on the beat", "#ff4d3d", true)
      this.fx.push({ kind: "finish", side: "opp", t: this.t })
      if (this.mode === "cpu") this.setOppState("stagger", 1.6)
      audio.sfx("cheer")
    }
  }

  private updatePlayer() {
    const p = this.player
    if (p.action === "hit" && this.t >= p.actionEnd) p.action = p.blocking ? "block" : "idle"
  }

  private updateHolds() {
    for (const [, tr] of this.pointers) {
      if (!tr.blocking && this.t - tr.downT > TAP_MAX) {
        tr.blocking = true
        this.setBlock(true)
      }
    }
  }

  // ---------- CPU opponent ----------

  private setOppState(state: OppState, duration: number) {
    this.opp.state = state
    this.opp.stateStart = this.t
    this.opp.stateEnd = this.t + duration
  }

  private startAttack(type: OppAttack, fixedWindup?: number, strikeAt?: number, side?: 1 | -1) {
    const o = this.opp
    const d = this.config.opponent.difficulty
    o.attack = type
    o.side = side ?? (Math.random() < 0.5 ? -1 : 1)
    const base = type === "power" ? 1.3 : ATTACKS[type].windup * (1.3 - d * 0.6)
    const windup = fixedWindup ?? base
    // Strikes land on the beat, so the music itself is a tell.
    const at = strikeAt ?? (fixedWindup ? this.t + windup : this.nextBeatAfter(this.t + windup))
    o.state = "windup"
    o.stateStart = this.t
    o.stateEnd = at
    if (type === "power") {
      this.oppSpecial = { active: true, start: this.t }
      this.showBanner(this.oppPower.name.toUpperCase(), `${this.oppName}: ${this.oppPower.tagline}`, this.oppPower.color, true)
      this.fx.push({ kind: "power", side: "opp", t: this.t, power: this.oppPower })
      audio.sfx("special")
    }
  }

  private updateOpponent() {
    const o = this.opp
    const opp = this.config.opponent
    if (this.special.active && o.state !== "stagger") return
    if (this.t < o.frozenUntil) return

    switch (o.state) {
      case "idle":
        if (this.t >= o.nextAttackAt) {
          if (o.vibe >= 100) {
            o.vibe = 0
            this.startAttack("power")
            break
          }
          const type = opp.pattern[o.patternIndex % opp.pattern.length]
          o.patternIndex++
          this.startAttack(type)
        } else if (this.t - o.stepAt > 1.2 && Math.random() < 0.01) {
          o.stepAt = this.t
          o.stepDir = Math.random() < 0.5 ? -1 : 1
          this.arena.angleTarget += o.stepDir * 0.4
        }
        break
      case "windup":
        if (this.t >= o.stateEnd) this.resolveStrike(o.attack, 0)
        break
      case "strike":
        if (this.t >= o.stateEnd) {
          const dodged = this.t < this.player.counterUntil
          this.setOppState("recover", (0.55 - opp.difficulty * 0.25) * (dodged ? 1.8 : 1))
          this.oppSpecial.active = false
        }
        break
      case "recover":
      case "stagger":
        if (this.t >= o.stateEnd) {
          o.state = "idle"
          const beats = 2 + Math.floor(Math.random() * 4 * (1.1 - opp.difficulty))
          o.nextAttackAt = this.t + beats * this.beatInterval
        }
        break
    }
  }

  /** Was I dodging or blocking at a given moment? Online strikes can arrive late, so this looks back. */
  private defenceAt(at: number) {
    const inLog = (log: [number, number][]) => log.some(([a, b]) => at >= a - 0.02 && at <= b + 0.02)
    return { dodging: inLog(this.dodgeLog), blocking: inLog(this.blockLog) }
  }

  /** A strike reaches me (CPU, or the other player online). I decide what happened to me. */
  private resolveStrike(type: OppAttack, dmgIn: number, id?: number, at = this.t) {
    const o = this.opp
    const p = this.player
    const head = this.renderer.playerHead()
    if (this.mode === "cpu" || o.state === "windup") this.setOppState("strike", 0.18)
    const power = type === "power"
    const def = this.net ? this.defenceAt(at) : { dodging: this.t < p.dodgeUntil, blocking: p.blocking }

    if (def.dodging) {
      this.stats.perfectDodges++
      p.counterUntil = this.t + 0.8
      p.vibe = Math.min(100, p.vibe + 6 * this.config.fighter.vibeRate)
      this.popup(power ? "POWER DODGED!" : "DODGED!", head.x, head.y - 40, "#22c3b5", 22)
      if (id !== undefined) this.net?.send({ k: "res", id, r: "dodge", dmg: 0 })
      return
    }

    const chin = this.config.fighter.chin
    let dmg: number
    if (this.mode === "cpu") {
      dmg = power ? this.oppPower.damage * 0.85 * this.config.opponent.power : ATTACKS[type as AttackType].damage * this.config.opponent.power
    } else dmg = dmgIn
    dmg *= chin
    const blocked = def.blocking
    if (blocked) {
      dmg *= power ? 0.35 : ATTACKS[type as AttackType].blockFactor
      audio.sfx("blocked")
      p.guardFlash = this.t
      this.popup("BLOCK", head.x, head.y - 30, "#a9a4c4", 18)
    } else {
      audio.sfx("hurt")
      p.action = "hit"
      p.actionStart = this.t
      p.actionEnd = this.t + 0.32
      p.combo = 0
      p.hitFlash = this.t
      p.hitSide = o.side
      this.shake = { until: this.t + 0.25, power: power ? 14 : 8 }
      this.popup(`-${Math.round(dmg)}`, head.x + o.side * 40, head.y, "#ff4d3d", power ? 32 : 24)
      if (power) this.applyPowerEffect(this.oppPower, "player")
      if (this.mode === "cpu") o.vibe = Math.min(100, o.vibe + 12 + this.config.opponent.difficulty * 10)
    }
    if (power) {
      this.cine = { kind: "power", side: "opp", start: this.t, until: this.t + 0.8 }
      this.oppSpecial.active = false
    }
    p.hp -= dmg
    this.stats.damageTaken += dmg
    if (id !== undefined) {
      this.net?.send({ k: "res", id, r: blocked ? "block" : "hit", dmg: Math.round(dmg * 10) / 10 })
      this.net?.send({ k: "hp", hp: Math.max(0, Math.round(p.hp * 10) / 10), vibe: Math.round(p.vibe), at: this.t })
    }
    if (p.hp <= 0) {
      p.hp = 0
      this.lastFinisher = null
      this.endMatch(true)
    }
  }

  private damageOpponent(dmg: number, side: 1 | -1) {
    const o = this.opp
    o.hp -= dmg
    o.hitFlash = this.t
    o.hitSide = side
    this.stats.damageDealt += dmg
    if (this.mode === "cpu") o.vibe = Math.min(100, o.vibe + 3)
    if (o.hp <= 0 && this.phase === "fight") {
      o.hp = 0
      this.endMatch(true)
    }
  }

  // ---------- online ----------

  private pumpNet() {
    const net = this.net
    if (!net) return
    for (const ev of net.drain("opp")) this.applyRemote(ev, "opp")
    if (this.mode === "watch") for (const ev of net.drain("me")) this.applyRemote(ev, "player")
    this.watchers = net.watchers()
    for (const r of net.reactions()) {
      const { w, h } = this.renderer.size
      this.popups.push({ text: r.e, x: w * (0.7 + Math.random() * 0.25), y: h * (0.62 + Math.random() * 0.1), born: this.t, color: "#ffffff", size: 30 })
    }
    if (this.mode === "pvp" && this.phase === "fight" && this.t - this.oppAliveCheckedAt > 1) {
      this.oppAliveCheckedAt = this.t
      if (!net.oppAlive()) {
        this.opp.hp = 0
        this.endMatch(true, "forfeit")
      }
    }
  }

  /** Applies one event from a remote fighter. In a fight that's always the opponent; when watching, either side. */
  private applyRemote(ev: NetEvent, side: Side) {
    const isOpp = side === "opp"
    switch (ev.k) {
      case "atk":
      case "pow": {
        const power = ev.k === "pow"
        if (isOpp) {
          this.startAttack(power ? "power" : ev.type, undefined, ev.at, power ? 1 : ev.side)
          this.opp.atkId = ev.id
          this.opp.atkDmg = ev.dmg
          if (this.mode === "pvp") this.incoming.push({ id: ev.id, at: ev.at, dmg: ev.dmg, type: power ? "power" : ev.type })
          if (!power && ev.k === "atk" && ev.combo) {
            const name = ev.combo
            this.showBanner(name.toUpperCase(), `${this.oppName} combo`, "#ff4d3d", true)
          }
        } else {
          // Watching: the left fighter winds up a punch or power.
          const p = this.player
          if (power) {
            p.action = "charge"
            p.actionStart = this.t
            p.actionEnd = ev.at
            this.pendingAtk = { id: ev.id, at: ev.at, side: "R", power: true, combo: null, sent: false }
            this.showBanner(this.playerPower.name.toUpperCase(), this.playerPower.tagline, this.playerPower.color, true)
          } else {
            const s = ev.side === -1 ? "L" : "R"
            p.action = s === "L" ? "windupL" : "windupR"
            p.actionStart = this.t
            p.actionEnd = ev.at - PUNCH_CONTACT
            this.pendingAtk = { id: ev.id, at: ev.at, side: s, power: false, combo: null, sent: false }
          }
        }
        break
      }
      case "dodge":
        if (isOpp) {
          this.opp.dodgeUntil = ev.until
          this.opp.dodgeDir = ev.dir
        } else {
          this.player.action = ev.dir === "up" ? "dodgeUp" : "dodgeDown"
          this.player.actionStart = ev.from
          this.player.actionEnd = ev.until
        }
        break
      case "block":
        if (isOpp) this.opp.blocking = ev.on
        else {
          this.player.blocking = ev.on
          this.player.action = ev.on ? "block" : "idle"
        }
        break
      case "step":
        this.arena.angleTarget += ev.dir * 0.45
        if (isOpp) {
          this.opp.stepAt = this.t
          this.opp.stepDir = ev.dir
        } else {
          this.player.stepAt = this.t
          this.player.stepDir = ev.dir
        }
        break
      case "res": {
        // The defender reports how my (or, when watching, the other fighter's) strike went.
        const head = isOpp ? this.renderer.oppHead() : this.renderer.playerHead()
        if (ev.r === "dodge") {
          this.popup(isOpp ? "SLIPPED!" : "DODGED!", head.x, head.y - 40, "#22c3b5", 20)
          break
        }
        const blocked = ev.r === "block"
        if (isOpp) {
          if (blocked) this.opp.guardFlash = this.t
          this.opp.hitFlash = this.t
          this.stats.damageDealt += ev.dmg
          if (!blocked) this.stats.landed++
          if (!blocked && this.mode === "pvp") this.player.vibe = Math.min(100, this.player.vibe + 11 * this.config.fighter.vibeRate)
        } else {
          if (blocked) this.player.guardFlash = this.t
          else {
            this.player.action = "hit"
            this.player.actionStart = this.t
            this.player.actionEnd = this.t + 0.32
            this.player.hitFlash = this.t
          }
        }
        this.landedEffects(blocked, ev.dmg >= 8, head.x, blocked ? head.guardY : head.y, isOpp ? this.config.fighter.colors.accent : this.config.opponent.colors.accent)
        if (!blocked) this.popup(`-${Math.round(ev.dmg)}`, head.x, head.y - 50, "#ff4d3d", 24)
        break
      }
      case "hp":
        if (isOpp) {
          this.opp.hp = ev.hp
          this.opp.vibe = ev.vibe
        } else {
          this.player.hp = ev.hp
          this.player.vibe = ev.vibe
        }
        break
      case "ko":
        if (isOpp) this.opp.hp = 0
        else this.player.hp = 0
        this.endMatch(true)
        break
    }
  }

  /** Online: strikes from the other player land on me at their beat. */
  private updateIncoming() {
    if (this.mode !== "pvp" || !this.incoming.length) return
    const due = this.incoming.filter((s) => this.t >= s.at)
    if (!due.length) return
    this.incoming = this.incoming.filter((s) => this.t < s.at)
    for (const s of due) this.resolveStrike(s.type, s.dmg, s.id, s.at)
  }

  /** Online/watching: the remote fighter's wind-up runs to its beat, then recovers. */
  private updateRemoteOpp() {
    const o = this.opp
    if (o.state === "windup" && this.t >= o.stateEnd) {
      this.setOppState("strike", 0.18)
      if (o.attack === "power") {
        this.fx.push({ kind: "power", side: "opp", t: this.t, power: this.oppPower })
        this.cine = { kind: "power", side: "opp", start: this.t, until: this.t + 0.8 }
        this.oppSpecial.active = false
      }
    } else if (o.state === "strike" && this.t >= o.stateEnd) this.setOppState("recover", 0.3)
    else if (o.state === "recover" && this.t >= o.stateEnd) o.state = "idle"
  }

  // ---------- effects ----------

  private popup(text: string, x: number, y: number, color: string, size: number) {
    this.popups.push({ text, x, y, born: this.t, color, size })
  }

  private burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 120 + Math.random() * 260
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, born: this.t, life: 0.45, color })
    }
  }

  // ---------- input ----------

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    audio.unlock()
    if (this.paused) return
    if (this.phase !== "fight" && this.phase !== "intro" && this.phase !== "over") {
      this.skip()
      return
    }
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {}
    const r = this.canvas.getBoundingClientRect()
    this.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top, downT: this.t, blocking: false })
  }

  private onPointerUp = (e: PointerEvent) => {
    const tr = this.pointers.get(e.pointerId)
    if (!tr) return
    this.pointers.delete(e.pointerId)
    const r = this.canvas.getBoundingClientRect()
    const dx = e.clientX - r.left - tr.x
    const dy = e.clientY - r.top - tr.y
    if (Math.abs(dy) > SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) {
      if (tr.blocking) this.releaseBlockIfNoHolds()
      this.dodge(dy < 0 ? "up" : "down")
      return
    }
    if (Math.abs(dx) > SWIPE_MIN * 1.3) {
      if (tr.blocking) this.releaseBlockIfNoHolds()
      this.step(dx > 0 ? 1 : -1)
      return
    }
    if (tr.blocking) {
      this.releaseBlockIfNoHolds()
      return
    }
    this.punch(tr.x < r.width / 2 ? "L" : "R", tr.downT)
  }

  private onPointerCancel = (e: PointerEvent) => {
    const tr = this.pointers.get(e.pointerId)
    this.pointers.delete(e.pointerId)
    if (tr?.blocking) this.releaseBlockIfNoHolds()
  }

  private releaseBlockIfNoHolds() {
    for (const [, tr] of this.pointers) if (tr.blocking) return
    this.setBlock(false)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || e.repeat) return
    if (this.phase === "entrance" || this.phase === "faceoff" || this.phase === "break") {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        this.skip()
      }
      return
    }
    const map: Record<string, () => void> = {
      ArrowLeft: () => this.punch("L"),
      ArrowRight: () => this.punch("R"),
      ArrowUp: () => this.dodge("up"),
      ArrowDown: () => this.dodge("down"),
      a: () => this.step(-1),
      d: () => this.step(1),
      " ": () => this.setBlock(true),
      s: () => this.triggerSpecial(),
    }
    const fn = map[e.key]
    if (fn) {
      e.preventDefault()
      audio.unlock()
      fn()
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") this.setBlock(false)
  }
}
