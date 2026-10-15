import { PUNCH_CONTACT, PUNCH_TIME, type FightEngine } from "./engine"
import { Scene3D } from "./scene3d"

const ATTACK_COLORS = { jab: "#f5c400", hook: "#ff8a3d", uppercut: "#ff4d3d", power: "#ff4d3d" } as const
const INK = "#14101f"

function ease(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : 1 - (1 - x) * (1 - x)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export type StreetTheme = "street" | "market" | "bridge" | "skyline" | "gadgets"

export function themeFor(venue: string): StreetTheme {
  if (/bridge|oshodi/i.test(venue)) return "bridge"
  if (/computer/i.test(venue)) return "gadgets"
  if (/market/i.test(venue)) return "market"
  if (/island|rooftop|ikoyi|square|balewa/i.test(venue)) return "skyline"
  return "street"
}

export const SIGNS: Record<StreetTheme, string[]> = {
  street: ["BUKA", "POS HERE", "CHEMIST", "SUYA SPOT", "BARBING SALON", "TAILOR", "PROVISIONS", "PURE WATER"],
  market: ["FABRICS", "PEPPER & TOMATO", "PROVISIONS", "SHOES", "BUKA", "POS HERE", "OKRIKA", "RICE & BEANS"],
  bridge: ["POS HERE", "RECHARGE CARD", "BUKA", "CHEMIST", "PHONE REPAIRS", "SUYA SPOT", "GOD'S TIME"],
  skyline: ["LOUNGE", "GRILL HOUSE", "SUYA SPOT", "BOUTIQUE", "CAFE", "EVENT CENTRE"],
  gadgets: ["UK USED", "PHONE REPAIRS", "LAPTOPS", "ACCESSORIES", "SCREEN FIX", "CHARGERS", "POS HERE"],
}

export const WALLS = ["#c96f4a", "#d9b26f", "#6f8fa8", "#8a6fb0", "#5f9e86", "#b8584f", "#d18f3f", "#7d8a99", "#e2d3b0"]
export const SIGN_COLORS = ["#1fb86a", "#ff4d3d", "#3a86ff", "#f5c400", "#e0457b", "#ffffff"]
/** Extra width on each side of the cached backdrop so it can slide for parallax. */
const PAD = 60

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private backdrop: HTMLCanvasElement | null = null
  private dpr = 1
  private font = "sans-serif"
  size = { w: 375, h: 812 }
  /** Sideways camera offset in px. Follows the player's dodges so the ring shifts in depth. */
  private camX = 0
  /** The 3D scene drawn underneath. When it's running, this canvas only draws effects and text on top. */
  private scene3d: Scene3D | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private e: FightEngine,
  ) {
    const css = getComputedStyle(document.documentElement).getPropertyValue("--font-anton").trim()
    if (css) this.font = css
    try {
      this.scene3d = new Scene3D(canvas, e, this.font)
    } catch {
      // No WebGL on this device: fall back to the flat 2D scene.
      this.scene3d = null
    }
    const ctx = canvas.getContext("2d", { alpha: !!this.scene3d })
    if (!ctx) throw new Error("Canvas 2D is not supported")
    this.ctx = ctx
    this.resize()
  }

  destroy() {
    this.backdrop = null
    this.scene3d?.dispose()
    this.scene3d = null
  }

  resize() {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.size = { w: Math.max(1, r.width), h: Math.max(1, r.height) }
    this.canvas.width = Math.round(this.size.w * this.dpr)
    this.canvas.height = Math.round(this.size.h * this.dpr)
    if (this.scene3d) this.scene3d.resize(this.size.w, this.size.h, this.dpr)
    else this.buildBackdrop()
  }

  private get scale() {
    return Math.min(this.size.w / 375, this.size.h / 760)
  }

  // ---------- 3D projection ----------
  // World X and Y are px at depth 1, where the opponent stands. Z is depth relative to the opponent.

  private get horizon() {
    return this.size.h * 0.33
  }

  private get camY() {
    return this.size.h * 0.25
  }

  private project(X: number, Y: number, Z: number) {
    const k = 1 / Z
    return { x: this.size.w / 2 + (X - this.camX) * k, y: this.horizon + (this.camY - Y) * k, k }
  }

  /** Where the player's face is on screen, for effects when they get hit. */
  playerHead() {
    if (this.scene3d) return this.scene3d.playerHead()
    return { x: this.size.w / 2, y: this.size.h * 0.7, guardY: this.size.h * 0.68 }
  }

  /** Where the opponent's face and guard are on screen right now. Punches aim here. */
  oppHead() {
    if (this.scene3d) return this.scene3d.oppHead()
    const s = this.scale
    const feet = this.project(0, 0, 1)
    const bob = Math.sin(this.e.beatPhase() * Math.PI * 2) * 3 * s
    const torsoTop = feet.y - 178 * s + bob
    return { x: feet.x, y: torsoTop - 18 * s, guardY: torsoTop - 4 * s }
  }

  // ---------- Lagos street backdrop ----------

  /** Static scenery is drawn once to an offscreen canvas so each frame is cheap on mid-range phones. */
  private buildBackdrop() {
    const { w, h } = this.size
    const W = w + PAD * 2
    const c = document.createElement("canvas")
    c.width = Math.round(W * this.dpr)
    c.height = this.canvas.height
    const g = c.getContext("2d")
    if (!g) return
    g.scale(this.dpr, this.dpr)

    const venue = this.e.config.opponent.venue
    const theme = themeFor(venue)
    let seed = 7
    for (const ch of venue) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483646
    seed = seed || 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
    const base = h * 0.36

    // Dusk sky over the lagoon haze.
    const sky = g.createLinearGradient(0, 0, 0, base)
    sky.addColorStop(0, "#120c24")
    sky.addColorStop(0.45, "#3a1f4d")
    sky.addColorStop(0.8, "#a8483f")
    sky.addColorStop(1, "#e08a3c")
    g.fillStyle = sky
    g.fillRect(0, 0, W, h)
    g.fillStyle = "rgba(255,255,255,0.6)"
    for (let i = 0; i < 40; i++) g.fillRect(rand() * W, rand() * h * 0.14, 1.5, 1.5)

    // Distant high-rises.
    const towers = theme === "skyline" ? 16 : 9
    for (let i = 0; i < towers; i++) {
      const tw = 18 + rand() * 30
      const th = h * (theme === "skyline" ? 0.14 + rand() * 0.18 : 0.08 + rand() * 0.1)
      const tx = rand() * W
      g.fillStyle = rand() > 0.5 ? "#2b1d44" : "#32214d"
      g.fillRect(tx, base - th, tw, th)
      g.fillStyle = "rgba(255,214,120,0.35)"
      for (let wy = base - th + 5; wy < base - 4; wy += 7) {
        for (let wx = tx + 3; wx < tx + tw - 3; wx += 6) if (rand() > 0.78) g.fillRect(wx, wy, 2.5, 3)
      }
      if (rand() > 0.6) {
        g.fillStyle = "#ff4d3d"
        g.fillRect(tx + tw / 2 - 1, base - th - 6, 2, 6)
      }
    }

    if (theme === "bridge") this.drawOverpass(g, W, h, base, rand)

    // Street-front buildings: painted walls, louvre windows, balconies, shop signs.
    const signs = [...SIGNS[theme]]
    let venueSignPlaced = false
    let x = -10
    while (x < W + 10) {
      const bw = 56 + rand() * 60
      const floors = theme === "skyline" ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3)
      const floorH = h * 0.045
      const bh = floorH * (floors + 1)
      const top = base - bh
      g.fillStyle = pick(WALLS)
      g.fillRect(x, top, bw, bh)
      g.fillStyle = "rgba(24,12,44,0.42)"
      g.fillRect(x, top, bw, bh)
      g.fillStyle = "rgba(0,0,0,0.25)"
      g.fillRect(x + bw - 5, top, 5, bh)

      if (rand() > 0.5) {
        // Corrugated zinc roof.
        g.fillStyle = "#5c524a"
        g.beginPath()
        g.moveTo(x - 4, top)
        g.lineTo(x + bw * 0.5, top - 12)
        g.lineTo(x + bw + 4, top)
        g.fill()
      } else if (rand() > 0.4) {
        // Overhead water tank.
        g.fillStyle = "#1b1530"
        g.fillRect(x + bw * 0.6, top - 16, 14, 16)
        g.fillRect(x + bw * 0.6 - 2, top - 18, 18, 3)
      }

      for (let f = 1; f <= floors; f++) {
        const fy = top + (f - 1) * floorH + 6
        for (let wx = x + 7; wx < x + bw - 16; wx += 18) {
          const lit = rand() > 0.55
          g.fillStyle = lit ? "rgba(255,190,90,0.75)" : "rgba(10,6,20,0.65)"
          g.fillRect(wx, fy, 10, floorH * 0.5)
          g.fillStyle = "rgba(0,0,0,0.35)"
          for (let ly = fy + 2; ly < fy + floorH * 0.5; ly += 3) g.fillRect(wx, ly, 10, 1)
        }
        if (rand() > 0.5) {
          g.strokeStyle = "rgba(230,220,200,0.55)"
          g.lineWidth = 1
          const by = fy + floorH * 0.62
          g.strokeRect(x + 4, by, bw - 8, floorH * 0.3)
          for (let rx = x + 8; rx < x + bw - 6; rx += 5) {
            g.beginPath()
            g.moveTo(rx, by)
            g.lineTo(rx, by + floorH * 0.3)
            g.stroke()
          }
        }
      }

      // Ground-floor shop with a hand-painted sign.
      const shopTop = base - floorH
      g.fillStyle = "rgba(255,170,80,0.28)"
      g.fillRect(x + 4, shopTop + 8, bw - 8, floorH - 8)
      const signH = Math.max(10, floorH * 0.32)
      const isVenue = !venueSignPlaced && x > W * 0.3
      const text = isVenue ? venue.toUpperCase() : signs.length ? signs.splice(Math.floor(rand() * signs.length), 1)[0] : pick(SIGNS[theme])
      if (isVenue) venueSignPlaced = true
      const signColor = isVenue ? "#f5c400" : pick(SIGN_COLORS)
      g.fillStyle = signColor
      g.fillRect(x + 2, shopTop - signH + 4, bw - 4, signH)
      g.fillStyle = signColor === "#ffffff" || signColor === "#f5c400" ? INK : "#ffffff"
      g.textAlign = "center"
      g.textBaseline = "middle"
      g.font = `${Math.min(signH * 0.75, ((bw - 8) / Math.max(4, text.length)) * 1.6)}px ${this.font}`
      g.fillText(text, x + bw / 2, shopTop - signH / 2 + 4.5, bw - 8)

      x += bw + 1
    }

    // Power poles with sagging wires.
    g.strokeStyle = "#0d0818"
    g.lineWidth = 3
    const poles: number[] = []
    for (let px = 30 + rand() * 40; px < W; px += W / 3.2) poles.push(px)
    for (const px of poles) {
      g.beginPath()
      g.moveTo(px, h * 0.13)
      g.lineTo(px, base)
      g.moveTo(px - 12, h * 0.15)
      g.lineTo(px + 12, h * 0.15)
      g.stroke()
    }
    g.lineWidth = 1
    g.strokeStyle = "rgba(10,6,20,0.8)"
    for (let i = 0; i < poles.length - 1; i++) {
      for (const off of [-10, 0, 10]) {
        g.beginPath()
        g.moveTo(poles[i] + off, h * 0.15)
        g.quadraticCurveTo((poles[i] + poles[i + 1]) / 2, h * 0.2, poles[i + 1] + off, h * 0.15)
        g.stroke()
      }
    }

    // Street level: asphalt, gutter, vendors and a parked danfo.
    g.fillStyle = "#1c1626"
    g.fillRect(0, base, W, h - base)
    g.fillStyle = "#2a2236"
    g.fillRect(0, base, W, 4)

    if (theme === "market" || theme === "gadgets") {
      for (let ux = 10 + rand() * 30; ux < W; ux += 46 + rand() * 30) this.drawUmbrella(g, ux, base, h, pick(["#ff4d3d", "#3a86ff", "#f5c400", "#1fb86a"]))
    }
    this.drawDanfo(g, W * (0.15 + rand() * 0.6), base, h)
    if (theme !== "skyline") this.drawKeke(g, W * (0.1 + rand() * 0.8), base, h)

    // Street lamps throw warm pools of light.
    for (let lx = 50 + rand() * 60; lx < W; lx += W / 2.4) {
      const glow = g.createRadialGradient(lx, h * 0.24, 2, lx, h * 0.24, h * 0.12)
      glow.addColorStop(0, "rgba(255,200,110,0.55)")
      glow.addColorStop(1, "rgba(255,200,110,0)")
      g.fillStyle = glow
      g.fillRect(lx - h * 0.12, h * 0.12, h * 0.24, h * 0.24)
      g.fillStyle = "#fff1c9"
      g.fillRect(lx - 5, h * 0.24 - 2, 10, 3)
    }

    // Bunting strung across the street.
    for (const yy of [0.1, 0.16]) {
      g.strokeStyle = "rgba(255,255,255,0.18)"
      g.beginPath()
      g.moveTo(0, h * yy)
      g.quadraticCurveTo(W / 2, h * (yy + 0.06), W, h * yy)
      g.stroke()
    }

    this.backdrop = c
  }

  private drawOverpass(g: CanvasRenderingContext2D, W: number, h: number, base: number, rand: () => number) {
    const deckTop = h * 0.19
    const deckH = h * 0.04
    for (let px = 40 + rand() * 30; px < W; px += 110) {
      g.fillStyle = "#3b3346"
      g.fillRect(px, deckTop + deckH, 22, base - deckTop - deckH)
      g.fillStyle = "rgba(0,0,0,0.3)"
      g.fillRect(px + 15, deckTop + deckH, 7, base - deckTop - deckH)
    }
    g.fillStyle = "#4a4156"
    g.fillRect(0, deckTop, W, deckH)
    g.fillStyle = "#2c2536"
    g.fillRect(0, deckTop + deckH, W, 6)
    g.fillStyle = "#6a6077"
    g.fillRect(0, deckTop - 5, W, 3)
    for (let rx = 0; rx < W; rx += 9) g.fillRect(rx, deckTop - 5, 2, 5)
    for (let i = 0; i < 4; i++) {
      const bx = rand() * W
      g.fillStyle = "#f2b705"
      g.fillRect(bx, deckTop - 14, 34, 10)
      g.fillStyle = INK
      g.fillRect(bx, deckTop - 10, 34, 2)
    }
  }

  private drawUmbrella(g: CanvasRenderingContext2D, x: number, base: number, h: number, color: string) {
    const r = h * 0.03
    const top = base - h * 0.045
    g.strokeStyle = "#1b1530"
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(x, top)
    g.lineTo(x, base)
    g.stroke()
    g.fillStyle = color
    g.beginPath()
    g.arc(x, top, r, Math.PI, 0)
    g.fill()
    g.fillStyle = "rgba(255,255,255,0.7)"
    g.beginPath()
    g.moveTo(x, top - r)
    g.lineTo(x - r * 0.35, top)
    g.lineTo(x + r * 0.35, top)
    g.fill()
    g.fillStyle = "#5c3b22"
    g.fillRect(x - r * 0.8, base - h * 0.014, r * 1.6, h * 0.014)
  }

  private drawDanfo(g: CanvasRenderingContext2D, x: number, base: number, h: number) {
    const bh = h * 0.042
    const bw = bh * 2.4
    const y = base - bh - 3
    g.fillStyle = "#f2b705"
    roundRect(g, x, y, bw, bh, 4)
    g.fill()
    g.fillStyle = INK
    g.fillRect(x, y + bh * 0.55, bw, bh * 0.1)
    g.fillRect(x, y + bh * 0.75, bw, bh * 0.08)
    g.fillStyle = "rgba(30,40,60,0.85)"
    for (let i = 0; i < 4; i++) g.fillRect(x + 4 + i * (bw / 4.3), y + 3, bw / 5, bh * 0.35)
    g.fillStyle = "#0b0814"
    for (const wx of [x + bw * 0.2, x + bw * 0.8]) {
      g.beginPath()
      g.arc(wx, base - 3, bh * 0.18, 0, Math.PI * 2)
      g.fill()
    }
  }

  private drawKeke(g: CanvasRenderingContext2D, x: number, base: number, h: number) {
    const kh = h * 0.032
    g.fillStyle = "#1fb86a"
    roundRect(g, x, base - kh - 2, kh * 1.3, kh, 5)
    g.fill()
    g.fillStyle = "#f5c400"
    g.fillRect(x, base - kh * 0.45, kh * 1.3, kh * 0.18)
    g.fillStyle = "#0b0814"
    g.beginPath()
    g.arc(x + kh * 0.25, base - 2, kh * 0.14, 0, Math.PI * 2)
    g.arc(x + kh * 1.1, base - 2, kh * 0.14, 0, Math.PI * 2)
    g.fill()
  }

  /** Sideways lean and duck of the player's body, shared by the camera and the player sprite. */
  private playerPose() {
    const p = this.e.player
    const t = this.e.t
    const ps = this.scale * 1.25
    let lean = 0
    let duck = 0
    if (p.action === "dodgeUp" || p.action === "dodgeDown") {
      const prog = (t - p.actionStart) / Math.max(0.01, p.actionEnd - p.actionStart)
      const curve = Math.sin(Math.min(1, prog) * Math.PI)
      if (p.action === "dodgeUp") lean = -60 * ps * curve
      else duck = 46 * ps * curve
    }
    return { lean, duck }
  }

  draw() {
    const { ctx, e } = this
    const { w, h } = this.size
    const t = e.t
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    let sx = 0
    let sy = 0
    if (t < e.shake.until) {
      sx = (Math.random() - 0.5) * e.shake.power
      sy = (Math.random() - 0.5) * e.shake.power
    }

    const pose = this.playerPose()
    // The camera rides with the player's head, so near things slide more than far ones.
    this.camX = pose.lean * 0.45
    const beatPhase = e.beatPhase()
    const pulse = Math.pow(1 - beatPhase, 3)
    const s = this.scale

    if (this.scene3d) {
      this.scene3d.render()
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(sx, sy)
      this.drawTell(s)
      this.drawBeatTrack(w, h * 0.86, s)
    } else {
      if (this.backdrop) ctx.drawImage(this.backdrop, -PAD - this.camX * 0.2, 0, w + PAD * 2, h)
      else {
        ctx.fillStyle = INK
        ctx.fillRect(0, 0, w, h)
      }

      this.drawLights(w, h, pulse)
      this.drawCrowd(s, beatPhase)
      this.drawRing(s, pulse)

      ctx.save()
      ctx.translate(sx, sy)

      const feet = this.project(0, 0, 1)
      ctx.strokeStyle = `rgba(245,196,0,${0.15 + pulse * 0.5})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(feet.x, feet.y, (70 + pulse * 30) * s, (16 + pulse * 6) * s, 0, 0, Math.PI * 2)
      ctx.stroke()

      this.drawOpponent(feet.x, feet.y, s, beatPhase)
      this.drawBeatTrack(w, h * 0.655, s)
      this.drawPlayer(w, h, s, pose)
    }

    for (const p of e.particles) {
      const life = 1 - (t - p.born) / p.life
      ctx.globalAlpha = Math.max(0, life)
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6)
    }
    ctx.globalAlpha = 1

    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const p of e.popups) {
      const age = (t - p.born) / 0.9
      ctx.globalAlpha = 1 - age
      ctx.font = `${p.size * s * (1 + (1 - ease(age * 4)) * 0.4)}px ${this.font}`
      ctx.lineWidth = 5
      ctx.strokeStyle = INK
      ctx.strokeText(p.text, p.x, p.y - age * 40)
      ctx.fillStyle = p.color
      ctx.fillText(p.text, p.x, p.y - age * 40)
    }
    ctx.globalAlpha = 1
    ctx.restore()

    if (t - e.player.hitFlash < 0.3) {
      const a = 0.45 * (1 - (t - e.player.hitFlash) / 0.3)
      const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.7)
      vg.addColorStop(0, "rgba(255,77,61,0)")
      vg.addColorStop(1, `rgba(255,77,61,${a})`)
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, w, h)
    }

    if (e.special.active) {
      const el = t - e.special.start
      const flash = el > 0.4 && el < 0.7 ? 1 - (el - 0.4) / 0.3 : 0
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.6
        ctx.fillStyle = e.config.fighter.colors.accent
        ctx.fillRect(0, 0, w, h)
        ctx.globalAlpha = 1
      }
    }

    this.drawBanner(w, h, s)
  }

  /** The "!" warning over the opponent's head while they wind up, for the 3D scene. */
  private drawTell(s: number) {
    const { ctx, e } = this
    const o = e.opp
    if (o.state !== "windup") return
    const head = this.oppHead()
    ctx.font = `${30 * s}px ${this.font}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.lineWidth = 5
    ctx.strokeStyle = INK
    ctx.strokeText("!", head.x, head.y - 50 * s)
    ctx.fillStyle = ATTACK_COLORS[o.attack]
    ctx.fillText("!", head.x, head.y - 50 * s)
  }

  private drawLights(w: number, h: number, pulse: number) {
    const { ctx } = this
    const colors = ["#f5c400", "#ff4d3d", "#1fb86a", "#22c3b5"]
    const shift = -this.camX * 0.2
    for (const [row, yy] of [0.1, 0.16].entries()) {
      for (let i = 0; i <= 10; i++) {
        const u = i / 10
        const x = u * w + shift
        const y = h * yy + Math.sin(u * Math.PI) * h * 0.03
        const lit = (i + row) % 2 === 0 ? 0.55 + pulse * 0.45 : 0.4
        ctx.globalAlpha = lit
        ctx.fillStyle = colors[(i + row) % colors.length]
        ctx.beginPath()
        ctx.arc(x, y, 3.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  /** Street crowd standing just behind the far ropes. */
  private drawCrowd(s: number, beatPhase: number) {
    const { ctx } = this
    const { w, h } = this.size
    const Z = 2.5
    const shirts = ["#1fb86a", "#ff4d3d", "#3a86ff", "#f5c400", "#e0457b", "#ffffff", "#8b4dff"]
    const count = 20
    const span = w * 2.6
    for (let i = 0; i < count; i++) {
      const X = -span / 2 + (i + 0.5) * (span / count)
      const bob = Math.abs(Math.sin((beatPhase + i * 0.17) * Math.PI)) * 10
      const height = h * (0.2 + (i % 3) * 0.015) + bob
      const top = this.project(X, height - h * 0.07, Z)
      const r = (24 + (i % 3) * 3) * s * top.k
      ctx.fillStyle = shirts[(i * 5) % shirts.length]
      roundRect(ctx, top.x - r * 1.4, top.y + r * 0.8, r * 2.8, r * 3, r)
      ctx.fill()
      ctx.fillStyle = "rgba(18,12,30,0.55)"
      ctx.fill()
      ctx.fillStyle = "#120c1e"
      ctx.beginPath()
      ctx.arc(top.x, top.y, r, 0, Math.PI * 2)
      ctx.fill()
      if (i % 4 === 1) {
        // Arm thrown up on the beat.
        ctx.strokeStyle = "#120c1e"
        ctx.lineWidth = r * 0.6
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(top.x + r, top.y + r * 1.2)
        ctx.lineTo(top.x + r * 1.6, top.y - r * 1.2 - bob * top.k)
        ctx.stroke()
      }
    }
  }

  /** The ring in perspective: raised canvas, corner posts with pads, and ropes running toward the camera. */
  private drawRing(s: number, pulse: number) {
    const { ctx } = this
    const { w, h } = this.size
    const RX = Math.max(w * 0.78, h * 0.36)
    const ZB = 2.1
    const ZF = 0.3
    const APRON = 1.1
    const P = (X: number, Y: number, Z: number) => this.project(X, Y, Z)

    const quad = (pts: { x: number; y: number }[]) => {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y)
      ctx.closePath()
    }

    // Apron edge, then the canvas inside the ropes.
    const ab = [P(-RX * APRON, 0, ZB + 0.12), P(RX * APRON, 0, ZB + 0.12), P(RX * APRON, 0, ZF), P(-RX * APRON, 0, ZF)]
    const skirtDrop = h * 0.05
    const skirt = [ab[0], ab[1], P(RX * APRON, -skirtDrop, ZB + 0.12), P(-RX * APRON, -skirtDrop, ZB + 0.12)]
    quad(skirt)
    ctx.fillStyle = "#0f3d26"
    ctx.fill()
    quad(ab)
    ctx.fillStyle = "#1d6b43"
    ctx.fill()

    const mat = [P(-RX, 0, ZB), P(RX, 0, ZB), P(RX, 0, ZF), P(-RX, 0, ZF)]
    quad(mat)
    const matGrad = ctx.createLinearGradient(0, mat[0].y, 0, h)
    matGrad.addColorStop(0, "#3b2b55")
    matGrad.addColorStop(1, "#5a4580")
    ctx.fillStyle = matGrad
    ctx.fill()

    ctx.save()
    quad(mat)
    ctx.clip()
    // Canvas seams converge on the vanishing point.
    ctx.strokeStyle = "rgba(255,255,255,0.05)"
    ctx.lineWidth = 1
    for (let i = -6; i <= 6; i++) {
      const a = P((RX * i) / 6, 0, ZB)
      const b = P((RX * i) / 6, 0, ZF)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    for (let z = ZF; z < ZB; z += 0.3) {
      const a = P(-RX, 0, z)
      const b = P(RX, 0, z)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    // Centre logo, a circle laid flat on the canvas.
    const ring = (radius: number, cz: number) => {
      ctx.beginPath()
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2
        const q = P(Math.cos(a) * radius, 0, cz + (Math.sin(a) * radius) / (h * 1.1))
        if (i === 0) ctx.moveTo(q.x, q.y)
        else ctx.lineTo(q.x, q.y)
      }
    }
    ctx.lineWidth = 5
    ctx.strokeStyle = "rgba(31,184,106,0.25)"
    ring(RX * 0.5, 1.3)
    ctx.stroke()
    // Overhead spotlight pool, brighter on the beat.
    const feet = P(0, 0, 1)
    const spot = ctx.createRadialGradient(feet.x, feet.y, 10, feet.x, feet.y, w * 0.75)
    spot.addColorStop(0, `rgba(245,196,0,${0.16 + pulse * 0.08})`)
    spot.addColorStop(1, "rgba(245,196,0,0)")
    ctx.fillStyle = spot
    ctx.fillRect(0, mat[0].y, w, h - mat[0].y)
    ctx.restore()

    // Padded edge where the canvas meets the apron.
    ctx.strokeStyle = "rgba(255,255,255,0.35)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(mat[0].x, mat[0].y)
    ctx.lineTo(mat[1].x, mat[1].y)
    ctx.stroke()

    const ropeYs = [h * 0.06, h * 0.105, h * 0.15]
    const ropeColors = ["#1fb86a", "#ffffff", "#1fb86a"]
    const postTop = h * 0.17
    const postW = 16 * s

    const post = (X: number, Z: number, padColor: string) => {
      const b = P(X, -skirtDrop, Z)
      const tp = P(X, postTop, Z)
      const pw = postW * tp.k
      const grad = ctx.createLinearGradient(tp.x - pw, 0, tp.x + pw, 0)
      grad.addColorStop(0, "#9a958c")
      grad.addColorStop(0.5, "#f4f0e6")
      grad.addColorStop(1, "#7d786f")
      ctx.fillStyle = grad
      ctx.fillRect(tp.x - pw / 2, tp.y, pw, b.y - tp.y)
      ctx.fillStyle = "#f4f0e6"
      ctx.beginPath()
      ctx.ellipse(tp.x, tp.y, pw / 2, pw / 5, 0, 0, Math.PI * 2)
      ctx.fill()
      for (const ry of ropeYs) {
        const q = P(X, ry, Z)
        const padW = pw * 1.7
        const padH = 18 * s * q.k
        ctx.fillStyle = padColor
        roundRect(ctx, q.x - padW / 2, q.y - padH / 2, padW, padH, padW * 0.3)
        ctx.fill()
        ctx.fillStyle = "rgba(255,255,255,0.3)"
        ctx.fillRect(q.x - padW / 2 + 1, q.y - padH / 2 + 1, padW * 0.3, padH - 2)
      }
    }

    const rope = (a: [number, number, number], b: [number, number, number], color: string, sag: number) => {
      ctx.strokeStyle = color
      ctx.lineCap = "round"
      const steps = 14
      let prev = P(...a)
      for (let i = 1; i <= steps; i++) {
        const u = i / steps
        const X = a[0] + (b[0] - a[0]) * u
        const Y = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag
        const Z = a[2] + (b[2] - a[2]) * u
        const q = P(X, Y, Z)
        ctx.lineWidth = Math.max(1.5, 7 * s * ((prev.k + q.k) / 2))
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(q.x, q.y)
        ctx.stroke()
        prev = q
      }
    }

    // Far ropes and posts first, then the side ropes that sweep past the camera.
    ropeYs.forEach((ry, i) => rope([-RX, ry, ZB], [RX, ry, ZB], ropeColors[i], h * 0.006))
    post(-RX, ZB, "#ff4d3d")
    post(RX, ZB, "#3a86ff")
    ctx.globalAlpha = 0.9
    ropeYs.forEach((ry, i) => {
      rope([-RX, ry, ZB], [-RX, ry, ZF], ropeColors[i], h * 0.012)
      rope([RX, ry, ZB], [RX, ry, ZF], ropeColors[i], h * 0.012)
    })
    ctx.globalAlpha = 1
  }

  private glove(x: number, y: number, r: number, color: string, gold = false) {
    const { ctx } = this
    if (gold) {
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r)
      g.addColorStop(0, "#fff3a8")
      g.addColorStop(0.5, "#f5c400")
      g.addColorStop(1, "#b07a00")
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = color
    }
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "rgba(255,255,255,0.28)"
    ctx.beginPath()
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    ctx.fillRect(x - r * 0.7, y + r * 0.55, r * 1.4, r * 0.3)
  }

  private arm(x1: number, y1: number, x2: number, y2: number, width: number, color: string) {
    const { ctx } = this
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  /** Arm drawn as a cone, wide at the shoulder and narrow at the wrist, so reach reads as depth. */
  private taperedArm(x1: number, y1: number, x2: number, y2: number, w1: number, w2: number, color: string) {
    const { ctx } = this
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x1 + (nx * w1) / 2, y1 + (ny * w1) / 2)
    ctx.lineTo(x2 + (nx * w2) / 2, y2 + (ny * w2) / 2)
    ctx.lineTo(x2 - (nx * w2) / 2, y2 - (ny * w2) / 2)
    ctx.lineTo(x1 - (nx * w1) / 2, y1 - (ny * w1) / 2)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x1, y1, w1 / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawOpponent(x: number, feet: number, s: number, beatPhase: number) {
    const { ctx, e } = this
    const o = e.opp
    const c = e.config.opponent.colors
    const t = e.t
    const bob = Math.sin(beatPhase * Math.PI * 2) * 3 * s
    const hurt = t - o.hitFlash < 0.15
    const recoil = hurt ? o.hitSide * 8 * s * (1 - (t - o.hitFlash) / 0.15) : 0

    ctx.save()
    let tilt = 0
    if (o.state === "stagger") tilt = Math.sin(t * 18) * 0.08
    if (o.state === "recover") tilt = 0.04
    ctx.translate(x + recoil, feet)
    ctx.rotate(tilt)
    ctx.translate(-x, -feet)

    ctx.fillStyle = "rgba(0,0,0,0.35)"
    ctx.beginPath()
    ctx.ellipse(x, feet, 50 * s, 10 * s, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = c.skin
    roundRect(ctx, x - 28 * s, feet - 62 * s, 22 * s, 60 * s, 8 * s)
    ctx.fill()
    roundRect(ctx, x + 6 * s, feet - 62 * s, 22 * s, 60 * s, 8 * s)
    ctx.fill()
    ctx.fillStyle = "#f2efe8"
    roundRect(ctx, x - 32 * s, feet - 8 * s, 28 * s, 10 * s, 4 * s)
    ctx.fill()
    roundRect(ctx, x + 4 * s, feet - 8 * s, 28 * s, 10 * s, 4 * s)
    ctx.fill()

    const torsoTop = feet - 178 * s + bob
    ctx.fillStyle = c.skin
    roundRect(ctx, x - 38 * s, torsoTop, 76 * s, 98 * s, 18 * s)
    ctx.fill()
    ctx.strokeStyle = "rgba(0,0,0,0.18)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, torsoTop + 22 * s)
    ctx.lineTo(x, torsoTop + 60 * s)
    ctx.stroke()

    ctx.fillStyle = c.trunks
    roundRect(ctx, x - 40 * s, feet - 92 * s + bob * 0.5, 80 * s, 38 * s, 6 * s)
    ctx.fill()
    ctx.fillStyle = c.accent
    ctx.fillRect(x - 40 * s, feet - 92 * s + bob * 0.5, 80 * s, 6 * s)

    // A clean hit snaps the head away from the glove.
    const snap = hurt && t - o.guardFlash > 0.2 ? 1 - (t - o.hitFlash) / 0.15 : 0
    const headX = x + o.hitSide * 10 * s * snap
    const headY = torsoTop - 18 * s - 6 * s * snap
    ctx.fillStyle = c.skin
    ctx.beginPath()
    ctx.arc(headX, headY, 24 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#1b1210"
    ctx.beginPath()
    ctx.arc(headX, headY - 4 * s, 24 * s, Math.PI * 1.05, Math.PI * 1.95)
    ctx.fill()
    ctx.fillStyle = c.accent
    ctx.fillRect(headX - 24 * s, headY - 10 * s, 48 * s, 5 * s)

    if (hurt || o.state === "stagger") {
      ctx.strokeStyle = INK
      ctx.lineWidth = 2.5
      for (const ex of [-9, 9]) {
        ctx.beginPath()
        ctx.moveTo(headX + (ex - 4) * s, headY - 1 * s)
        ctx.lineTo(headX + (ex + 4) * s, headY + 5 * s)
        ctx.moveTo(headX + (ex + 4) * s, headY - 1 * s)
        ctx.lineTo(headX + (ex - 4) * s, headY + 5 * s)
        ctx.stroke()
      }
    } else {
      for (const ex of [-9, 9]) {
        ctx.fillStyle = "#ffffff"
        ctx.beginPath()
        ctx.ellipse(headX + ex * s, headY + 2 * s, 4.5 * s, 3.5 * s, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.arc(headX + ex * s, headY + 2.5 * s, 2 * s, 0, Math.PI * 2)
        ctx.fill()
      }
      if (o.state === "windup") {
        ctx.strokeStyle = INK
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(headX - 14 * s, headY - 6 * s)
        ctx.lineTo(headX - 4 * s, headY - 2 * s)
        ctx.moveTo(headX + 14 * s, headY - 6 * s)
        ctx.lineTo(headX + 4 * s, headY - 2 * s)
        ctx.stroke()
      }
    }

    const shoulderY = torsoTop + 14 * s
    const gr = 17 * s
    let lg = { x: x - 22 * s, y: torsoTop - 6 * s, r: gr }
    let rg = { x: x + 22 * s, y: torsoTop - 6 * s, r: gr }

    if (o.state === "windup") {
      const prog = Math.min(1, (t - o.stateStart) / Math.max(0.01, o.stateEnd - o.stateStart))
      const pull = ease(prog)
      const low = o.attack === "uppercut" ? 70 * s : o.attack === "hook" ? 10 * s : 0
      const back = { x: x + o.side * (22 + 34 * pull) * s, y: torsoTop - 6 * s + low * pull, r: gr * (1 + pull * 0.15) }
      if (o.side === 1) rg = back
      else lg = back
      const col = ATTACK_COLORS[o.attack]
      const glowR = gr * (1.6 + Math.sin(t * 30) * 0.15 + pull * 0.6)
      const glow = ctx.createRadialGradient(back.x, back.y, gr * 0.5, back.x, back.y, glowR)
      glow.addColorStop(0, col)
      glow.addColorStop(1, "rgba(0,0,0,0)")
      ctx.globalAlpha = 0.45 + pull * 0.45
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(back.x, back.y, glowR, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.font = `${30 * s}px ${this.font}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.lineWidth = 5
      ctx.strokeStyle = INK
      ctx.strokeText("!", x, headY - 44 * s)
      ctx.fillStyle = col
      ctx.fillText("!", x, headY - 44 * s)
    } else if (o.state === "strike") {
      const fwd = { x: x + o.side * 6 * s, y: torsoTop + 10 * s, r: gr * 2.4 }
      if (o.side === 1) rg = fwd
      else lg = fwd
    } else if (o.state === "recover" || o.state === "stagger") {
      lg = { x: x - 34 * s, y: torsoTop + 48 * s, r: gr }
      rg = { x: x + 34 * s, y: torsoTop + 48 * s, r: gr }
    } else if (t - o.guardFlash < 0.25) {
      // Gloves shut in front of the face to catch a punch.
      lg = { x: x - 13 * s, y: torsoTop - 4 * s, r: gr * 1.15 }
      rg = { x: x + 13 * s, y: torsoTop - 4 * s, r: gr * 1.15 }
    }

    this.arm(x - 34 * s, shoulderY, lg.x, lg.y, 13 * s, c.skin)
    this.arm(x + 34 * s, shoulderY, rg.x, rg.y, 13 * s, c.skin)
    const ordered = o.side === 1 ? [lg, rg] : [rg, lg]
    for (const g of ordered) this.glove(g.x, g.y, g.r, c.gloves)

    if (o.state === "stagger") {
      ctx.fillStyle = "#f5c400"
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * 30 * s, headY - 30 * s + Math.sin(a) * 6 * s, 4 * s, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.restore()
  }

  private drawBeatTrack(w: number, y: number, s: number) {
    const { ctx, e } = this
    const span = w * 0.36
    ctx.strokeStyle = "rgba(255,255,255,0.12)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(w / 2 - span, y)
    ctx.lineTo(w / 2 + span, y)
    ctx.stroke()

    const ph = e.beatPhase()
    const near = Math.min(ph, 1 - ph) * e.beatInterval < 0.13
    ctx.strokeStyle = near ? "#f5c400" : "rgba(255,255,255,0.6)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(w / 2, y, 14 * s * (near ? 1.15 : 1), 0, Math.PI * 2)
    ctx.stroke()

    const nextBeat = e.nextBeatAfter(e.t)
    for (let k = 0; k < 3; k++) {
      const dt = nextBeat + k * e.beatInterval - e.t
      const d = (dt / (e.beatInterval * 2)) * span
      if (d > span) continue
      ctx.globalAlpha = 1 - d / span
      ctx.fillStyle = "#f5c400"
      for (const dir of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(w / 2 + dir * d, y, 6 * s, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  private drawPlayer(w: number, h: number, s: number, pose: { lean: number; duck: number }) {
    const { ctx, e } = this
    const p = e.player
    const f = e.config.fighter
    const c = f.colors
    const cos = e.config.cosmetics
    const t = e.t
    const ps = s * 1.25

    const lean = pose.lean + (p.action === "hit" ? (Math.random() - 0.5) * 6 : 0)
    const duck = pose.duck

    const cx = w / 2 + lean
    const shoulderY = h * 0.8 + duck

    ctx.fillStyle = c.skin
    roundRect(ctx, cx - 62 * ps, shoulderY, 124 * ps, 120 * ps, 30 * ps)
    ctx.fill()
    ctx.strokeStyle = "rgba(0,0,0,0.2)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx, shoulderY + 20 * ps)
    ctx.lineTo(cx, shoulderY + 90 * ps)
    ctx.stroke()

    const trunksY = shoulderY + 92 * ps
    ctx.fillStyle = cos.ankaraTrunks ? "#e0457b" : c.trunks
    ctx.fillRect(cx - 64 * ps, trunksY, 128 * ps, 60 * ps)
    if (cos.ankaraTrunks) {
      for (let i = 0; i < 8; i++) {
        const tx = cx - 64 * ps + i * 16 * ps
        ctx.fillStyle = i % 2 ? "#f5c400" : "#1fb86a"
        ctx.beginPath()
        ctx.moveTo(tx, trunksY + 10 * ps)
        ctx.lineTo(tx + 8 * ps, trunksY + 24 * ps)
        ctx.lineTo(tx + 16 * ps, trunksY + 10 * ps)
        ctx.fill()
        ctx.fillStyle = "#14101f"
        ctx.beginPath()
        ctx.arc(tx + 8 * ps, trunksY + 36 * ps, 4 * ps, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = c.accent
    ctx.fillRect(cx - 64 * ps, trunksY, 128 * ps, 8 * ps)

    ctx.fillStyle = c.skin
    ctx.beginPath()
    ctx.arc(cx - 27 * ps, shoulderY - 22 * ps, 6 * ps, 0, Math.PI * 2)
    ctx.arc(cx + 27 * ps, shoulderY - 22 * ps, 6 * ps, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#1b1210"
    ctx.beginPath()
    ctx.arc(cx, shoulderY - 24 * ps, 28 * ps, 0, Math.PI * 2)
    ctx.fill()

    const head = this.oppHead()
    const gr = 24 * ps
    const restY = shoulderY - 34 * ps
    let lg = { x: cx - 50 * ps, y: restY, r: gr }
    let rg = { x: cx + 50 * ps, y: restY, r: gr }
    let impact: { x: number; y: number; age: number; blocked: boolean } | null = null

    if (p.action === "punchL" || p.action === "punchR") {
      // Extend to the face (or the guard), hold on contact, then pull back.
      const el = t - p.actionStart
      const hold = 0.03
      const out =
        el < PUNCH_CONTACT ? ease(el / PUNCH_CONTACT) : el < PUNCH_CONTACT + hold ? 1 : 1 - ease((el - PUNCH_CONTACT - hold) / (PUNCH_TIME - PUNCH_CONTACT - hold))
      const side = p.action === "punchL" ? -1 : 1
      const target = p.punchBlocked ? { x: head.x + side * 13 * s, y: head.guardY + 4 * s } : { x: head.x + side * 8 * s, y: head.y + 6 * s }
      const from = side === -1 ? lg : rg
      const g = {
        x: from.x + (target.x - from.x) * out,
        y: from.y + (target.y - from.y) * out,
        // Shrinks with distance so it reads as travelling into the ring.
        r: gr * (1 - out * 0.5),
      }
      if (side === -1) lg = g
      else rg = g
      if (el >= PUNCH_CONTACT) impact = { x: target.x, y: target.y, age: (el - PUNCH_CONTACT) / 0.12, blocked: p.punchBlocked }
    } else if (p.action === "block") {
      lg = { x: cx - 20 * ps, y: shoulderY - 70 * ps, r: gr * 1.15 }
      rg = { x: cx + 20 * ps, y: shoulderY - 70 * ps, r: gr * 1.15 }
    } else if (p.action === "special") {
      const prog = (t - p.actionStart) / 1.1
      const out = prog < 0.4 ? ease(prog / 0.4) : prog < 0.6 ? 1 : 1 - ease((prog - 0.6) / 0.4)
      const wob = Math.sin(t * 40) * 6 * ps * (prog < 0.4 ? 1 : 0)
      const ty = head.y + 10 * s
      lg = { x: cx - 50 * ps + (head.x - 10 * s - (cx - 50 * ps)) * out + wob, y: restY + (ty - restY) * out, r: gr * (1 - out * 0.4) }
      rg = { x: cx + 50 * ps + (head.x + 10 * s - (cx + 50 * ps)) * out - wob, y: restY + (ty - restY) * out, r: gr * (1 - out * 0.4) }
    } else {
      const sway = Math.sin(e.beatPhase() * Math.PI * 2) * 3 * ps
      lg.y += sway
      rg.y -= sway
    }

    this.taperedArm(cx - 56 * ps, shoulderY + 12 * ps, lg.x, lg.y, 22 * ps, lg.r * 0.9, c.skin)
    this.taperedArm(cx + 56 * ps, shoulderY + 12 * ps, rg.x, rg.y, 22 * ps, rg.r * 0.9, c.skin)
    this.glove(lg.x, lg.y, lg.r, c.gloves, cos.goldGloves)
    this.glove(rg.x, rg.y, rg.r, c.gloves, cos.goldGloves)

    if (impact && impact.age < 1) {
      // Contact flash where the glove meets the face or guard.
      const a = 1 - impact.age
      ctx.globalAlpha = a
      ctx.strokeStyle = impact.blocked ? "#a9a4c4" : "#ffffff"
      ctx.lineWidth = 3 * s
      ctx.beginPath()
      ctx.arc(impact.x, impact.y, (14 + impact.age * 26) * s, 0, Math.PI * 2)
      ctx.stroke()
      if (!impact.blocked) {
        ctx.fillStyle = "#fff3a8"
        ctx.beginPath()
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2
          const rr = (i % 2 ? 8 : 22 + impact.age * 10) * s
          const px = impact.x + Math.cos(ang) * rr
          const py = impact.y + Math.sin(ang) * rr
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
  }

  private drawBanner(w: number, h: number, s: number) {
    const { ctx, e } = this
    const b = e.banner
    if (!b) return
    const age = e.t - b.born
    // Combo, power and finisher call-outs flash up mid-fight and then get out of the way.
    const life = b.big && e.phase === "fight" ? 1.6 : Number.POSITIVE_INFINITY
    if (age > life) return
    const fade = age > life - 0.3 ? (life - age) / 0.3 : 1
    const scale = 1 + (1 - ease(age * 5)) * (b.big ? 1.1 : 0.6)
    ctx.save()
    ctx.globalAlpha = fade
    // Walk-out names sit low, under the fighter walking out.
    const y = b.big ? 0.3 : e.phase === "entrance" && e.walk ? 0.74 : 0.42
    ctx.translate(w / 2 + (b.big && age < 0.25 ? (Math.random() - 0.5) * 8 : 0), h * y)
    ctx.scale(scale, scale)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const size = Math.min((b.big ? 76 : 64) * s, (w * 0.92) / Math.max(4, b.text.length * 0.52))
    ctx.font = `${size}px ${this.font}`
    ctx.lineJoin = "round"
    if (b.big) {
      ctx.shadowColor = b.color
      ctx.shadowBlur = 24
    }
    ctx.lineWidth = b.big ? 12 : 10
    ctx.strokeStyle = INK
    ctx.strokeText(b.text, 0, 0)
    ctx.fillStyle = b.color
    ctx.fillText(b.text, 0, 0)
    ctx.shadowBlur = 0
    if (b.sub) {
      ctx.font = `${18 * s}px ${this.font}`
      ctx.lineWidth = 6
      ctx.strokeText(b.sub.toUpperCase(), 0, size * 0.75)
      ctx.fillStyle = "#ffffff"
      ctx.fillText(b.sub.toUpperCase(), 0, size * 0.75)
    }
    ctx.restore()
  }
}
