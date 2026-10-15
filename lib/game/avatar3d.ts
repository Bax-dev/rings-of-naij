import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const UP = v3(0, 1, 0)

export function std(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra })
}

export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const g = c.getContext("2d")
  if (g) paint(g)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Small deterministic RNG, so the same seed always builds the same person. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
  }
}
export type Rng = ReturnType<typeof rng>

export function hashString(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Places a unit-height, Y-aligned mesh so it spans from a to b. */
function span(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a)
  const len = Math.max(0.001, d.length())
  mesh.position.copy(a).addScaledVector(d, 0.5)
  mesh.scale.set(1, len, 1)
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len))
}

/** Two-bone IK: where the elbow (or knee) goes for a limb reaching from root to tip. */
function joint(root: THREE.Vector3, tip: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const dir = tip.clone().sub(root)
  const d = Math.min(Math.max(dir.length(), 0.01), l1 + l2 - 0.001)
  dir.normalize()
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize()
  return root.clone().addScaledVector(dir, a).addScaledVector(bend, h)
}

// ---------- looks ----------

export const SKIN_TONES = ["#8a5a3a", "#7a4a2c", "#6b3f24", "#5e3720", "#5a3520", "#4f2e1b", "#3f2416", "#93613f"]
const HAIR_COLORS = ["#120c09", "#120c09", "#120c09", "#1d130d", "#3a2414"]
const DYES = ["#e0457b", "#ff4d3d", "#f5c400", "#8b4dff", "#22c3b5", "#f2efe8"]
const CLOTH = ["#1fb86a", "#ff4d3d", "#3a86ff", "#f5c400", "#e0457b", "#ffffff", "#8b4dff", "#f08a24", "#22c3b5", "#14101f", "#2b3a67", "#7a1f2b"]
const DENIM = ["#2b3a67", "#1f2a44", "#3d4f7a", "#14101f", "#e9e4d8"]

export type HairStyle = "lowcut" | "fade" | "afro" | "locs" | "braids" | "cornrows" | "hightop" | "bald" | "bun" | "wig" | "twists"
export type TopStyle = "bare" | "sportsbra" | "tank" | "tee" | "long" | "suit" | "kaftan" | "dress" | "jersey" | "referee"
export type BottomStyle = "trunks" | "shorts" | "jeans" | "trousers" | "skirt"
export type Tattoo = "tribal" | "sun" | "stars" | "script" | "wings" | "lattice" | "rose" | "band" | "sleeve"

export interface Look {
  sex: "m" | "f"
  skin: string
  height: number
  bulk: number
  hair: HairStyle
  hairColor: string
  tipColor: string | null
  beard: "none" | "stubble" | "goatee" | "full"
  top: TopStyle
  topColor: string
  topColor2: string
  bottom: BottomStyle
  bottomColor: string
  shoes: string
  boots: boolean
  gloves: THREE.Material | null
  accent: string | null
  trunks: THREE.Material | null
  tattoos: { chest: Tattoo | null; back: Tattoo | null; armL: Tattoo | null; armR: Tattoo | null; leg: Tattoo | null }
  chain: string | null
  cap: string | null
  shades: boolean
  earrings: boolean
  gele: string | null
  tie: string | null
  bowTie: boolean
  /** Reading glasses, for the elders in the VIP seats. */
  specs?: boolean
  /** A fila cap (soft Yoruba cap) instead of a baseball cap. */
  fila?: string | null
  /** Crowd members skip the small joint spheres to keep draw calls down on phones. */
  lite: boolean
}

const CHEST_INK: Tattoo[] = ["tribal", "sun", "stars", "script", "wings", "rose", "lattice"]
const BACK_INK: Tattoo[] = ["wings", "sun", "lattice", "tribal", "script"]
const ARM_INK: Tattoo[] = ["sleeve", "band", "tribal", "stars", "script", "rose"]

function tattoos(r: Rng, heavy: number) {
  return {
    chest: r.chance(heavy * 0.7) ? r.pick(CHEST_INK) : null,
    back: r.chance(heavy * 0.6) ? r.pick(BACK_INK) : null,
    armL: r.chance(heavy * 0.8) ? r.pick(ARM_INK) : null,
    armR: r.chance(heavy * 0.6) ? r.pick(ARM_INK) : null,
    leg: r.chance(heavy * 0.25) ? r.pick(["band", "stars", "script"] as Tattoo[]) : null,
  }
}

/** Fighters who are drawn as women. */
export const FEMALE_FIGHTERS = new Set(["mama_fuji", "mama_fuji_cpu", "ayra_nova", "temzy", "tiva_savanna", "yemi_alayo"])

/** A boxer: shirtless (or sports top), trunks in their colours, and their own hair and ink. */
export function boxerLook(
  seedKey: string,
  colors: { gloves: string; trunks: string; skin: string; accent: string },
  opts: { female: boolean; gloves: THREE.Material; trunks?: THREE.Material | null; bulk: number },
): Look {
  const r = rng(hashString(seedKey))
  const f = opts.female
  return {
    sex: f ? "f" : "m",
    skin: colors.skin,
    height: r.range(0.97, 1.05) * (f ? 0.96 : 1),
    bulk: opts.bulk,
    hair: f ? r.pick(["braids", "bun", "cornrows", "twists", "afro"] as HairStyle[]) : r.pick(["lowcut", "fade", "locs", "cornrows", "hightop", "bald", "twists", "afro"] as HairStyle[]),
    hairColor: r.pick(HAIR_COLORS),
    tipColor: r.chance(0.3) ? r.pick(DYES) : null,
    beard: f ? "none" : r.pick(["none", "stubble", "goatee", "full", "stubble"] as const),
    top: f ? "sportsbra" : "bare",
    topColor: colors.accent === "#ffffff" ? colors.trunks : colors.accent,
    topColor2: colors.trunks,
    bottom: "trunks",
    bottomColor: colors.trunks,
    shoes: r.pick(["#f2efe8", "#14101f", colors.gloves]),
    boots: true,
    gloves: opts.gloves,
    accent: colors.accent,
    trunks: opts.trunks ?? null,
    tattoos: tattoos(r, 0.95),
    chain: r.chance(0.35) ? r.pick(["#f5c400", "#d8d6d0"]) : null,
    cap: null,
    shades: false,
    earrings: f || r.chance(0.3),
    gele: null,
    tie: null,
    bowTie: false,
    lite: false,
  }
}

export function refereeLook(): Look {
  return {
    sex: "m",
    skin: "#5a3520",
    height: 1,
    bulk: 1,
    hair: "lowcut",
    hairColor: "#2a2420",
    tipColor: null,
    beard: "goatee",
    top: "referee",
    topColor: "#f4f2ee",
    topColor2: "#f4f2ee",
    bottom: "trousers",
    bottomColor: "#1a1626",
    shoes: "#0b0814",
    boots: false,
    gloves: null,
    accent: null,
    trunks: null,
    tattoos: { chest: null, back: null, armL: null, armR: null, leg: null },
    chain: null,
    cap: null,
    shades: false,
    earrings: false,
    gele: null,
    tie: null,
    bowTie: true,
    lite: false,
  }
}

/** A random Lagos spectator: street wear, suits, kaftans, dresses, wigs, caps, and plenty of ink. */
export function spectatorLook(seed: number): Look {
  const r = rng(seed)
  const f = r.chance(0.45)
  const top: TopStyle = f ? r.pick(["dress", "tee", "tank", "kaftan", "long", "dress"] as TopStyle[]) : r.pick(["tee", "tee", "jersey", "suit", "kaftan", "tank", "long", "bare"] as TopStyle[])
  const suit = top === "suit"
  const showsSkin = top === "bare" || top === "tank" || top === "tee"
  return {
    sex: f ? "f" : "m",
    skin: r.pick(SKIN_TONES),
    height: r.range(0.92, 1.06) * (f ? 0.95 : 1),
    bulk: r.range(0.88, 1.12),
    hair: f ? r.pick(["braids", "wig", "bun", "afro", "twists", "cornrows", "braids"] as HairStyle[]) : r.pick(["lowcut", "fade", "locs", "hightop", "bald", "twists", "lowcut", "cornrows"] as HairStyle[]),
    hairColor: r.pick(HAIR_COLORS),
    tipColor: r.chance(f ? 0.35 : 0.15) ? r.pick(DYES) : null,
    beard: f ? "none" : r.pick(["none", "stubble", "goatee", "full"] as const),
    top,
    topColor: suit ? r.pick(["#2b5fb8", "#14101f", "#3a3a4a", "#6b1f2b"]) : r.pick(CLOTH),
    topColor2: r.pick(CLOTH),
    bottom: top === "dress" ? "skirt" : top === "kaftan" ? "trousers" : suit ? "trousers" : f ? r.pick(["jeans", "skirt", "jeans"] as BottomStyle[]) : r.pick(["jeans", "jeans", "shorts", "trousers"] as BottomStyle[]),
    bottomColor: suit ? "#14101f" : r.pick(DENIM),
    shoes: r.pick(["#f2efe8", "#14101f", "#7a1f2b", "#3a86ff", "#e0457b"]),
    boots: false,
    gloves: null,
    accent: null,
    trunks: null,
    tattoos: showsSkin ? tattoos(r, 0.7) : { chest: null, back: null, armL: null, armR: null, leg: null },
    chain: !f && r.chance(0.35) ? r.pick(["#f5c400", "#d8d6d0"]) : null,
    cap: !f && !suit && r.chance(0.3) ? r.pick(CLOTH) : null,
    shades: r.chance(0.2),
    earrings: f ? r.chance(0.8) : r.chance(0.15),
    gele: f && top === "kaftan" ? r.pick(CLOTH) : null,
    tie: suit ? r.pick(["#ff4d3d", "#f5c400", "#1fb86a", "#e0457b"]) : null,
    bowTie: false,
    lite: true,
  }
}

/** An elder in the VIP seats: grey hair, glasses, and their best suit, agbada or gele. */
export function seniorLook(seed: number): Look {
  const r = rng(seed)
  const f = r.chance(0.4)
  const agbada = r.chance(0.5)
  const top: TopStyle = f ? "kaftan" : agbada ? "kaftan" : "suit"
  const fabric = r.pick(["#f2efe8", "#2b5fb8", "#7a1f2b", "#1f6b4a", "#c98a3d", "#3a3a4a"])
  return {
    sex: f ? "f" : "m",
    skin: r.pick(SKIN_TONES),
    height: r.range(0.93, 1.02),
    bulk: r.range(1.0, 1.18),
    hair: f ? "bun" : r.pick(["lowcut", "bald", "lowcut"] as HairStyle[]),
    hairColor: r.pick(["#d8d6d0", "#b8b4ac", "#8f8a84"]),
    tipColor: null,
    beard: f ? "none" : r.pick(["full", "goatee", "stubble"] as const),
    top,
    topColor: top === "suit" ? r.pick(["#14101f", "#2b2f45", "#3a3a4a"]) : fabric,
    topColor2: r.pick(["#f5c400", "#f2efe8", "#c98a3d"]),
    bottom: "trousers",
    bottomColor: top === "suit" ? "#14101f" : fabric,
    shoes: r.pick(["#14101f", "#5a3520"]),
    boots: false,
    gloves: null,
    accent: null,
    trunks: null,
    tattoos: { chest: null, back: null, armL: null, armR: null, leg: null },
    chain: !f && r.chance(0.4) ? "#f5c400" : null,
    cap: null,
    shades: false,
    earrings: f,
    gele: f ? r.pick(["#e0457b", "#f5c400", "#8b4dff", "#1fb86a"]) : null,
    tie: top === "suit" ? r.pick(["#7a1f2b", "#f5c400", "#1f6b4a"]) : null,
    bowTie: false,
    specs: r.chance(0.7),
    fila: !f && agbada ? fabric : null,
    lite: true,
  }
}

// ---------- textures ----------

const INK = "rgba(14,8,10,0.82)"

/** Draws on a canvas that wraps around a limb or torso, repeating across the seam. */
function wrapped(g: CanvasRenderingContext2D, w: number, draw: (dx: number) => void) {
  for (const dx of [-w, 0, w]) {
    g.save()
    g.translate(dx, 0)
    draw(dx)
    g.restore()
  }
}

function inkSun(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.strokeStyle = INK
  g.fillStyle = INK
  g.lineWidth = r * 0.12
  for (const k of [1, 0.65]) {
    g.beginPath()
    g.arc(x, y, r * k, 0, Math.PI * 2)
    g.stroke()
  }
  g.beginPath()
  g.arc(x, y, r * 0.25, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    g.beginPath()
    g.moveTo(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1)
    g.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5)
    g.stroke()
  }
}

function inkStar(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.fillStyle = INK
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath()
  g.fill()
}

function inkTribal(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = INK
  g.fillRect(x, y, w, h * 0.12)
  g.fillRect(x, y + h * 0.88, w, h * 0.12)
  const n = Math.max(3, Math.round(w / (h * 0.6)))
  for (let i = 0; i < n; i++) {
    const sx = x + (i / n) * w
    g.beginPath()
    g.moveTo(sx, y + h * 0.12)
    g.lineTo(sx + w / n / 2, y + h * 0.75)
    g.lineTo(sx + w / n, y + h * 0.12)
    g.fill()
  }
}

function inkScript(g: CanvasRenderingContext2D, x: number, y: number, w: number, size: number, r: Rng) {
  // Flowing cursive strokes. Reads as lettering from a distance without spelling anything.
  g.strokeStyle = INK
  g.lineWidth = size * 0.12
  g.lineCap = "round"
  g.beginPath()
  g.moveTo(x, y)
  for (let px = 0; px < w; px += size * 0.25) {
    g.lineTo(x + px, y + Math.sin(px / (size * 0.18) + r.next()) * size * 0.35 - (r.chance(0.12) ? size * 0.6 : 0))
  }
  g.stroke()
}

function inkWings(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.strokeStyle = INK
  g.lineWidth = s * 0.05
  g.lineCap = "round"
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      g.beginPath()
      g.moveTo(cx + dir * s * 0.1, cy + i * s * 0.08)
      g.quadraticCurveTo(cx + dir * s * (0.6 - i * 0.05), cy - s * 0.3 + i * s * 0.1, cx + dir * s * (1 - i * 0.12), cy - s * 0.1 + i * s * 0.14)
      g.stroke()
    }
  }
}

function inkLattice(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.strokeStyle = INK
  g.lineWidth = Math.max(2, w * 0.03)
  const step = w / 5
  for (let i = -5; i <= 10; i++) {
    g.beginPath()
    g.moveTo(x + i * step, y)
    g.lineTo(x + i * step + h, y + h)
    g.moveTo(x + i * step + h, y)
    g.lineTo(x + i * step, y + h)
    g.stroke()
  }
}

function inkRose(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.strokeStyle = INK
  g.lineWidth = r * 0.12
  g.beginPath()
  for (let a = 0; a < Math.PI * 6; a += 0.2) g.lineTo(x + Math.cos(a) * (a / (Math.PI * 6)) * r, y + Math.sin(a) * (a / (Math.PI * 6)) * r)
  g.stroke()
  g.fillStyle = INK
  for (const dir of [-1, 1]) {
    g.beginPath()
    g.ellipse(x + dir * r * 1.2, y + r * 0.9, r * 0.55, r * 0.22, dir * 0.6, 0, Math.PI * 2)
    g.fill()
  }
}

/** Skin texture for the torso: u runs around the body starting at the chest, v from waist (bottom) to neck (top). */
function torsoSkin(look: Look, r: Rng) {
  const W = 512
  const H = 256
  return canvasTexture(W, H, (g) => {
    g.fillStyle = look.skin
    g.fillRect(0, 0, W, H)
    // Soft muscle shading: pecs and abs.
    g.fillStyle = "rgba(0,0,0,0.12)"
    wrapped(g, W, () => {
      for (const px of [W * 0.06, W * 0.94]) {
        g.beginPath()
        g.ellipse(px, H * 0.32, W * 0.05, H * 0.03, 0, 0, Math.PI * 2)
        g.fill()
      }
      for (let i = 0; i < 3; i++) g.fillRect(-W * 0.012, H * (0.48 + i * 0.12), W * 0.024, H * 0.03)
    })
    const chest = look.tattoos.chest
    if (chest) {
      wrapped(g, W, () => {
        if (chest === "sun") inkSun(g, W * 0.92, H * 0.3, H * 0.09)
        else if (chest === "stars") for (let i = 0; i < 4; i++) inkStar(g, W * (0.04 + i * 0.035), H * (0.22 + (i % 2) * 0.08), H * 0.035)
        else if (chest === "script") inkScript(g, -W * 0.09, H * 0.45, W * 0.18, H * 0.12, r)
        else if (chest === "wings") inkWings(g, 0, H * 0.22, W * 0.11)
        else if (chest === "rose") inkRose(g, W * 0.07, H * 0.3, H * 0.07)
        else if (chest === "lattice") inkLattice(g, W * 0.86, H * 0.18, W * 0.1, H * 0.2)
        else inkTribal(g, W * 0.86, H * 0.18, W * 0.28, H * 0.12)
      })
    }
    const back = look.tattoos.back
    if (back) {
      if (back === "wings") inkWings(g, W * 0.5, H * 0.25, W * 0.18)
      else if (back === "sun") inkSun(g, W * 0.5, H * 0.35, H * 0.14)
      else if (back === "lattice") inkLattice(g, W * 0.42, H * 0.2, W * 0.16, H * 0.35)
      else if (back === "script") inkScript(g, W * 0.38, H * 0.3, W * 0.24, H * 0.14, r)
      else inkTribal(g, W * 0.36, H * 0.15, W * 0.28, H * 0.16)
    }
  })
}

/** Skin texture for an arm or leg, which wraps around a cylinder. */
function limbSkin(skin: string, ink: Tattoo | null, r: Rng) {
  const W = 256
  const H = 128
  return canvasTexture(W, H, (g) => {
    g.fillStyle = skin
    g.fillRect(0, 0, W, H)
    if (!ink) return
    if (ink === "sleeve") {
      inkTribal(g, 0, H * 0.05, W, H * 0.22)
      inkLattice(g, 0, H * 0.32, W, H * 0.3)
      inkTribal(g, 0, H * 0.7, W, H * 0.2)
    } else if (ink === "band") inkTribal(g, 0, H * 0.35, W, H * 0.2)
    else if (ink === "tribal") inkTribal(g, 0, H * 0.15, W, H * 0.45)
    else if (ink === "stars") for (let i = 0; i < 6; i++) inkStar(g, r.next() * W, H * (0.2 + r.next() * 0.6), H * 0.08)
    else if (ink === "rose") inkRose(g, W * 0.15, H * 0.5, H * 0.18)
    else inkScript(g, W * 0.02, H * 0.5, W * 0.5, H * 0.22, r)
  })
}

/** Ankara-style wax print for kaftans, dresses and geles. */
function ankara(c1: string, c2: string, r: Rng) {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = c1
    g.fillRect(0, 0, 256, 256)
    const motif = r.next()
    for (let y = 0; y < 256; y += 32) {
      for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
        g.fillStyle = c2
        if (motif < 0.33) {
          g.beginPath()
          g.arc(x + 16, y + 16, 10, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = c1
          g.beginPath()
          g.arc(x + 16, y + 16, 4, 0, Math.PI * 2)
          g.fill()
        } else if (motif < 0.66) {
          g.beginPath()
          g.moveTo(x + 16, y + 2)
          g.lineTo(x + 30, y + 16)
          g.lineTo(x + 16, y + 30)
          g.lineTo(x + 2, y + 16)
          g.fill()
        } else {
          g.fillRect(x + 4, y + 4, 24, 8)
          g.fillRect(x + 12, y + 12, 8, 16)
        }
      }
    }
  })
}

function jerseyTex(c1: string, c2: string, num: number) {
  return canvasTexture(256, 128, (g) => {
    g.fillStyle = c1
    g.fillRect(0, 0, 256, 128)
    g.fillStyle = c2
    g.fillRect(0, 0, 256, 12)
    g.fillRect(0, 40, 256, 8)
    g.font = "bold 54px sans-serif"
    g.textAlign = "center"
    g.textBaseline = "middle"
    g.fillText(String(num), 128, 82)
  })
}

// ---------- body ----------

export interface Pose {
  /** Hand targets in the avatar's local space (+Z is forward). */
  handL: THREE.Vector3
  handR: THREE.Vector3
  /** Upper-body shift at shoulder height: x sideways, z forward. */
  lean: THREE.Vector2
  crouch: number
  headOffset: THREE.Vector3
  /** Sitting on a seat this high, knees forward. */
  seat?: number
  /** Footwork: shifts the feet forward/back, -1..1. */
  stride?: number
}

type MatKey = string

/** Collects small static parts by material, then merges each group into one mesh to save draw calls. */
class PartBag {
  private parts = new Map<MatKey, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>()
  add(mat: THREE.Material, geo: THREE.BufferGeometry, pos: THREE.Vector3, rot = new THREE.Euler(), scale = v3(1, 1, 1)) {
    const g = geo.index ? geo.toNonIndexed() : geo
    g.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale))
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name)
    const entry = this.parts.get(mat.uuid) ?? { mat, geos: [] }
    entry.geos.push(g)
    this.parts.set(mat.uuid, entry)
  }
  build(parent: THREE.Object3D, shadow: boolean) {
    for (const { mat, geos } of this.parts.values()) {
      const merged = mergeGeometries(geos)
      for (const g of geos) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = shadow
      parent.add(mesh)
    }
    this.parts.clear()
  }
}

const SPHERE = new THREE.SphereGeometry(1, 14, 10)

/** A person built from shaped primitives, posed every frame with simple IK. */
export class Avatar {
  readonly root = new THREE.Group()
  /** Holds every body part, so a knockout can tip the whole figure over. */
  readonly body = new THREE.Group()
  /** The head and everything on it (face, hair, hats) move together. */
  readonly head = new THREE.Group()
  readonly gloveR: number
  private torso = new THREE.Group()
  private hips: THREE.Mesh
  private skirt: THREE.Mesh | null = null
  private neck: THREE.Mesh
  private limbs: Record<"uaL" | "uaR" | "faL" | "faR" | "thL" | "thR" | "shL" | "shR", THREE.Mesh>
  private joints: THREE.Mesh[] = []
  private hands: [THREE.Mesh, THREE.Mesh]
  private feet: [THREE.Mesh, THREE.Mesh]
  private look: Look
  /** Extra props held in the right hand, e.g. a phone. */
  readonly handProp = new THREE.Group()
  private belt: THREE.Group | null = null

  constructor(look: Look, seed: number) {
    this.look = look
    const r = rng(seed)
    const b = look.bulk
    const shadow = !look.lite
    this.root.add(this.body)
    this.root.scale.setScalar(look.height)

    const skin = std(look.skin, { roughness: 0.55, metalness: 0.02 })
    const dark = std("#0b0814", { roughness: 0.4 })
    const hairMat = std(look.hairColor, { roughness: 0.9 })
    const cloth = (c: string) => std(c, { roughness: 0.85 })

    // --- torso: a lathed profile gives chest, waist and shoulders a real shape ---
    const female = look.sex === "f"
    const profile = female
      ? [
          [0.125, 0],
          [0.12, 0.1],
          [0.145, 0.22],
          [0.16, 0.29],
          [0.15, 0.36],
          [0.15, 0.42],
          [0.07, 0.49],
          [0.05, 0.5],
        ]
      : [
          [0.14, 0],
          [0.14, 0.1],
          [0.155, 0.22],
          [0.175, 0.32],
          [0.172, 0.4],
          [0.15, 0.45],
          [0.07, 0.5],
          [0.05, 0.51],
        ]
    const torsoGeo = new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x * b, y)),
      20,
    )
    let torsoMat: THREE.Material
    const showsTorso = look.top === "bare" || look.top === "sportsbra"
    if (showsTorso) torsoMat = std("#ffffff", { map: torsoSkin(look, r), roughness: 0.55 })
    else if (look.top === "kaftan" || look.top === "dress") torsoMat = std("#ffffff", { map: ankara(look.topColor, look.topColor2, r), roughness: 0.85 })
    else if (look.top === "jersey") torsoMat = std("#ffffff", { map: jerseyTex(look.topColor, look.topColor2, 1 + Math.floor(r.next() * 30)), roughness: 0.8 })
    else torsoMat = cloth(look.topColor)
    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat)
    torsoMesh.scale.set(1.12, 1, 0.72)
    torsoMesh.castShadow = shadow
    this.torso.add(torsoMesh)
    this.body.add(this.torso)

    // Clothing details fixed to the torso.
    const torsoBag = new PartBag()
    if (look.top === "sportsbra") {
      const bra = new THREE.CylinderGeometry(0.168 * b, 0.155 * b, 0.13, 20, 1, true)
      torsoBag.add(cloth(look.topColor), bra, v3(0, 0.3, 0), new THREE.Euler(), v3(1.13, 1, 0.75))
    }
    if (look.top === "suit") {
      const shirt = std("#f2efe8")
      torsoBag.add(shirt, new THREE.BoxGeometry(0.09, 0.3, 0.02), v3(0, 0.33, 0.118))
      if (look.tie) torsoBag.add(std(look.tie), new THREE.BoxGeometry(0.035, 0.26, 0.015), v3(0, 0.32, 0.13))
    }
    if (look.top === "referee") {
      torsoBag.add(dark, new THREE.BoxGeometry(0.008, 0.36, 0.01), v3(0, 0.27, 0.124))
      torsoBag.add(std("#f4f2ee"), new THREE.BoxGeometry(0.18, 0.04, 0.12), v3(0, 0.48, 0.02))
    }
    if (look.bowTie) {
      torsoBag.add(dark, new THREE.ConeGeometry(0.03, 0.05, 4), v3(-0.025, 0.47, 0.115), new THREE.Euler(0, 0, Math.PI / 2))
      torsoBag.add(dark, new THREE.ConeGeometry(0.03, 0.05, 4), v3(0.025, 0.47, 0.115), new THREE.Euler(0, 0, -Math.PI / 2))
    }
    if (look.chain) {
      const metal = std(look.chain, { metalness: 0.9, roughness: 0.25 })
      torsoBag.add(metal, new THREE.TorusGeometry(0.085, 0.008, 6, 24), v3(0, 0.44, 0.04), new THREE.Euler(1.2, 0, 0), v3(1, 1.25, 1))
      torsoBag.add(metal, new THREE.CylinderGeometry(0.02, 0.02, 0.008, 12), v3(0, 0.35, 0.125), new THREE.Euler(Math.PI / 2, 0, 0))
    }
    if (look.top === "jersey" || look.top === "tee" || look.top === "long" || look.top === "referee") {
      torsoBag.add(cloth(look.topColor2), new THREE.TorusGeometry(0.065, 0.012, 6, 18), v3(0, 0.485, 0.01), new THREE.Euler(Math.PI / 2, 0, 0))
    }
    torsoBag.build(this.torso, shadow)

    // --- hips / lower clothing ---
    const bottomMat = look.trunks ?? (look.bottom === "trunks" ? std(look.bottomColor, { roughness: 0.35, metalness: 0.1 }) : cloth(look.bottomColor))
    this.hips = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * b, look.bottom === "trunks" ? 0.185 * b : 0.17 * b, look.bottom === "trunks" ? 0.3 : 0.22, 18), bottomMat)
    this.hips.scale.set(1.1, 1, 0.8)
    this.hips.castShadow = shadow
    if (look.accent && look.bottom === "trunks") {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.163 * b, 0.163 * b, 0.05, 18, 1, true), std(look.accent, { roughness: 0.4 }))
      band.position.y = 0.13
      this.hips.add(band)
    }
    this.body.add(this.hips)
    if (look.bottom === "skirt" || look.top === "kaftan" || look.top === "dress") {
      const long = look.top === "kaftan" ? 0.55 : look.top === "dress" ? 0.48 : 0.36
      const skirtMat = look.top === "kaftan" || look.top === "dress" ? torsoMat : bottomMat
      this.skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * b, 0.26 * b, long, 18, 1, true), skirtMat)
      this.skirt.geometry.translate(0, -long / 2, 0)
      ;(skirtMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide
      this.skirt.scale.set(1.1, 1, 0.85)
      this.skirt.castShadow = shadow
      this.body.add(this.skirt)
    }

    // --- neck and head ---
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 1, 10), skin)
    this.neck.castShadow = shadow
    this.body.add(this.neck)
    this.buildHead(look, r, skin, dark, hairMat, shadow)
    this.body.add(this.head)

    // --- limbs ---
    const armMat = (ink: Tattoo | null) => (ink ? std("#ffffff", { map: limbSkin(look.skin, ink, r), roughness: 0.55 }) : skin)
    const sleeveTop = ["tee", "long", "suit", "jersey", "referee", "kaftan", "dress"].includes(look.top)
    const sleeveLow = ["long", "suit", "referee", "kaftan"].includes(look.top)
    const topMat = look.top === "kaftan" || look.top === "jersey" ? torsoMat : cloth(look.topColor)
    const legMat = look.bottom === "jeans" || look.bottom === "trousers" ? bottomMat : null
    const shinSkin = look.tattoos.leg ? armMat(look.tattoos.leg) : skin
    const limb = (mat: THREE.Material, r0: number, r1: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 12), mat)
      m.castShadow = shadow
      this.body.add(m)
      return m
    }
    this.limbs = {
      uaL: limb(sleeveTop ? topMat : armMat(look.tattoos.armL), 0.06 * b, 0.048 * b),
      uaR: limb(sleeveTop ? topMat : armMat(look.tattoos.armR), 0.06 * b, 0.048 * b),
      faL: limb(sleeveLow ? topMat : sleeveTop ? armMat(look.tattoos.armL) : armMat(look.tattoos.armL), 0.047 * b, 0.036 * b),
      faR: limb(sleeveLow ? topMat : sleeveTop ? armMat(look.tattoos.armR) : armMat(look.tattoos.armR), 0.047 * b, 0.036 * b),
      thL: limb(legMat ?? (look.bottom === "shorts" ? bottomMat : skin), 0.085 * b, 0.06 * b),
      thR: limb(legMat ?? (look.bottom === "shorts" ? bottomMat : skin), 0.085 * b, 0.06 * b),
      shL: limb(legMat ?? shinSkin, 0.06 * b, 0.042 * b),
      shR: limb(legMat ?? skin, 0.06 * b, 0.042 * b),
    }
    if (!look.lite) {
      const shoulderMat = sleeveTop ? topMat : skin
      for (const mat of [shoulderMat, shoulderMat, sleeveLow ? topMat : skin, sleeveLow ? topMat : skin]) {
        const j = new THREE.Mesh(SPHERE, mat)
        j.scale.setScalar(this.joints.length < 2 ? 0.058 * b : 0.045 * b)
        j.castShadow = shadow
        this.body.add(j)
        this.joints.push(j)
      }
    }

    this.gloveR = look.gloves ? 0.085 : 0.042
    const handMat = look.gloves ?? skin
    const hand = () => {
      const m = new THREE.Mesh(SPHERE, handMat)
      m.scale.set(this.gloveR, this.gloveR * (look.gloves ? 0.95 : 1.1), this.gloveR * (look.gloves ? 1.2 : 1))
      m.castShadow = shadow
      this.body.add(m)
      return m
    }
    this.hands = [hand(), hand()]
    if (look.gloves) {
      // White cuff where the glove meets the wrist.
      for (const h of this.hands) {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 12, 1, true), std("#f2efe8"))
        cuff.rotation.x = Math.PI / 2
        cuff.position.z = -0.8
        h.add(cuff)
      }
    }
    this.hands[1].add(this.handProp)

    const shoeMat = std(look.shoes, { roughness: 0.45 })
    // Boxing boots add a padded cuff around the ankle; everyone else wears low shoes.
    const foot = () => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), shoeMat)
      f.castShadow = shadow
      if (look.boots) {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.15, 12), shoeMat)
        cuff.position.set(0, 0.1, -0.05)
        cuff.castShadow = shadow
        f.add(cuff)
      }
      this.body.add(f)
      return f
    }
    this.feet = [foot(), foot()]

    this.pose(Avatar.guard())
  }

  private buildHead(look: Look, r: Rng, skin: THREE.Material, dark: THREE.Material, hairMat: THREE.Material, shadow: boolean) {
    const bag = new PartBag()
    const female = look.sex === "f"
    const lip = std(new THREE.Color(look.skin).multiplyScalar(female ? 0.75 : 0.65).getStyle(), { roughness: 0.45 })
    const white = std("#f2efe8", { roughness: 0.3 })

    // Skull, jaw and cheekbones.
    bag.add(skin, SPHERE, v3(0, 0, 0), undefined, v3(0.112, 0.13, 0.12))
    bag.add(skin, SPHERE, v3(0, -0.055, 0.025), undefined, v3(0.09, 0.07, 0.095))
    // Ears.
    for (const s of [-1, 1]) bag.add(skin, SPHERE, v3(s * 0.112, -0.005, -0.005), undefined, v3(0.016, 0.032, 0.024))
    // Nose and lips.
    bag.add(skin, SPHERE, v3(0, -0.02, 0.118), undefined, v3(0.024, 0.022, 0.022))
    bag.add(lip, SPHERE, v3(0, -0.062, 0.105), undefined, v3(0.032, 0.011, 0.012))
    bag.add(lip, SPHERE, v3(0, -0.074, 0.102), undefined, v3(0.028, 0.012, 0.012))
    // Eyes and brows.
    for (const s of [-1, 1]) {
      bag.add(white, SPHERE, v3(s * 0.042, 0.018, 0.098), undefined, v3(0.019, 0.013, 0.012))
      bag.add(dark, SPHERE, v3(s * 0.042, 0.018, 0.108), undefined, v3(0.009, 0.009, 0.006))
      bag.add(hairMat, new THREE.BoxGeometry(1, 1, 1), v3(s * 0.043, 0.045, 0.106), new THREE.Euler(0, 0, s * (female ? 0.15 : 0.08)), v3(0.038, female ? 0.006 : 0.01, 0.01))
    }
    // Facial hair.
    if (look.beard === "full" || look.beard === "stubble") {
      const beardMat = look.beard === "stubble" ? std(new THREE.Color(look.skin).multiplyScalar(0.55).getStyle(), { roughness: 0.95 }) : hairMat
      bag.add(beardMat, new THREE.SphereGeometry(1, 14, 8, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.45, Math.PI * 0.45), v3(0, -0.035, 0.012), new THREE.Euler(0, Math.PI, 0), v3(0.098, 0.085, -0.11))
    }
    if (look.beard === "goatee" || look.beard === "full") {
      bag.add(hairMat, SPHERE, v3(0, -0.098, 0.085), undefined, v3(0.028, 0.02, 0.02))
      bag.add(hairMat, new THREE.BoxGeometry(1, 1, 1), v3(0, -0.05, 0.112), undefined, v3(0.05, 0.008, 0.008))
    }

    // Hair.
    const hairCap = (scale: number, lift = 0) =>
      bag.add(hairMat, new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), v3(0, 0.012 + lift, -0.012), new THREE.Euler(-0.45, 0, 0), v3(0.118 * scale, 0.138 * scale, 0.128 * scale))
    const tip = look.tipColor ? std(look.tipColor, { roughness: 0.8 }) : hairMat
    const strands = (n: number, len: number, rad: number, spread: number, colorTips: boolean) => {
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.5 + spread * (i / (n - 1) - 0.5) * 2)
        const x = Math.cos(a) * 0.115
        const z = -Math.sin(a) * 0.105 - 0.01
        const l = len * r.range(0.85, 1.1)
        bag.add(hairMat, new THREE.CylinderGeometry(rad, rad * 0.8, l, 6), v3(x, 0.02 - l / 2, z), new THREE.Euler(z * 0.6, 0, -x * 0.6))
        if (colorTips) bag.add(tip, new THREE.CylinderGeometry(rad * 0.82, rad * 0.7, l * 0.25, 6), v3(x, 0.02 - l * 0.95, z), new THREE.Euler(z * 0.6, 0, -x * 0.6))
      }
    }
    switch (look.hair) {
      case "lowcut":
        hairCap(1.01)
        break
      case "fade":
        hairCap(1.0)
        bag.add(hairMat, SPHERE, v3(0, 0.085, -0.005), undefined, v3(0.1, 0.06, 0.105))
        break
      case "afro":
        hairCap(1.02)
        bag.add(hairMat, SPHERE, v3(0, 0.085, -0.055), undefined, v3(0.168, 0.145, 0.15))
        if (look.tipColor) bag.add(tip, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), v3(0, 0.087, -0.055), undefined, v3(0.17, 0.147, 0.152))
        break
      case "hightop":
        hairCap(1.01)
        bag.add(hairMat, new THREE.CylinderGeometry(0.1, 0.108, 0.13, 16), v3(0, 0.13, -0.01))
        if (look.tipColor) bag.add(tip, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), v3(0, 0.2, -0.01))
        break
      case "locs":
        hairCap(1.04, 0.01)
        strands(11, r.range(0.18, 0.3), 0.017, 0.42, !!look.tipColor)
        break
      case "twists":
        hairCap(1.04, 0.01)
        for (let i = 0; i < 16; i++) {
          const a = r.next() * Math.PI * 2
          const up = r.range(0.3, 1)
          bag.add(hairMat, new THREE.ConeGeometry(0.022, 0.08, 6), v3(Math.cos(a) * 0.09 * (1.1 - up * 0.4), 0.06 + up * 0.07, Math.sin(a) * 0.09 * (1.1 - up * 0.4) - 0.01), new THREE.Euler(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6))
        }
        break
      case "braids":
        hairCap(1.03, 0.005)
        strands(16, r.range(0.32, 0.45), 0.014, 0.48, !!look.tipColor)
        break
      case "cornrows": {
        hairCap(1.0)
        for (let i = -3; i <= 3; i++) bag.add(hairMat, new THREE.TorusGeometry(0.122, 0.009, 4, 20, Math.PI * 0.9), v3(i * 0.026, 0.01, -0.01), new THREE.Euler(0, Math.PI / 2, -Math.PI * 0.05))
        if (female) strands(6, 0.3, 0.013, 0.2, !!look.tipColor)
        break
      }
      case "bun":
        hairCap(1.02)
        bag.add(look.tipColor ? tip : hairMat, SPHERE, v3(0, 0.15, -0.06), undefined, v3(0.065, 0.06, 0.065))
        break
      case "wig": {
        const wigMat = look.tipColor ? tip : hairMat
        bag.add(wigMat, new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), v3(0, 0.015, -0.005), new THREE.Euler(-0.15, 0, 0), v3(0.128, 0.145, 0.135))
        bag.add(wigMat, new THREE.CylinderGeometry(0.13, 0.15, 0.32, 16, 1, true, Math.PI * 0.62, Math.PI * 1.76), v3(0, -0.12, -0.01))
        bag.add(wigMat, new THREE.BoxGeometry(0.2, 0.04, 0.03), v3(0, 0.075, 0.105), new THREE.Euler(0.3, 0, 0))
        break
      }
      case "bald":
        break
    }

    // Headwear and accessories.
    if (look.gele) {
      const geleMat = std("#ffffff", { map: ankara(look.gele, "#f5c400", r), roughness: 0.7 })
      for (let i = 0; i < 4; i++) bag.add(geleMat, new THREE.TorusGeometry(0.1 - i * 0.012, 0.035, 8, 20), v3(0, 0.08 + i * 0.04, -0.01), new THREE.Euler(Math.PI / 2 - 0.3 + i * 0.15, i * 0.5, 0))
      bag.add(geleMat, new THREE.ConeGeometry(0.06, 0.16, 8), v3(0.07, 0.2, -0.04), new THREE.Euler(0, 0, -0.7))
    }
    if (look.cap) {
      const capMat = std(look.cap, { roughness: 0.8 })
      const back = r.chance(0.5)
      bag.add(capMat, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), v3(0, 0.035, 0), undefined, v3(0.122, 0.11, 0.128))
      bag.add(capMat, new THREE.BoxGeometry(0.17, 0.012, 0.11), v3(0, 0.04, back ? -0.15 : 0.15), new THREE.Euler(back ? 0.15 : -0.15, 0, 0))
    }
    if (look.accent && look.bottom === "trunks" && look.hair !== "afro" && look.hair !== "hightop") {
      bag.add(std(look.accent), new THREE.CylinderGeometry(0.122, 0.122, 0.028, 18, 1, true), v3(0, 0.06, -0.005), new THREE.Euler(-0.15, 0, 0))
    }
    if (look.fila) {
      const filaMat = std(look.fila, { roughness: 0.9 })
      bag.add(filaMat, new THREE.CylinderGeometry(0.115, 0.122, 0.09, 16), v3(0.01, 0.1, -0.01), new THREE.Euler(-0.1, 0, -0.25))
      bag.add(filaMat, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), v3(0.025, 0.14, -0.01), new THREE.Euler(0, 0, -0.35), v3(0.11, 0.05, 0.11))
    }
    if (look.specs) {
      const frame = std("#c9a24a", { metalness: 0.8, roughness: 0.3 })
      for (const s of [-1, 1]) bag.add(frame, new THREE.TorusGeometry(0.022, 0.003, 6, 16), v3(s * 0.042, 0.018, 0.116))
      bag.add(frame, new THREE.BoxGeometry(0.03, 0.004, 0.004), v3(0, 0.022, 0.118))
    }
    if (look.shades) {
      const lens = std("#0b0814", { roughness: 0.1, metalness: 0.6 })
      for (const s of [-1, 1]) bag.add(lens, new THREE.BoxGeometry(0.046, 0.026, 0.01), v3(s * 0.042, 0.02, 0.118))
      bag.add(lens, new THREE.BoxGeometry(0.17, 0.008, 0.008), v3(0, 0.03, 0.118))
    }
    if (look.earrings) {
      const gold = std("#f5c400", { metalness: 0.9, roughness: 0.25 })
      for (const s of [-1, 1]) bag.add(gold, new THREE.TorusGeometry(female ? 0.018 : 0.008, 0.003, 6, 14), v3(s * 0.116, female ? -0.05 : -0.035, 0), new THREE.Euler(0, Math.PI / 2, 0))
    }
    bag.build(this.head, shadow)
  }

  static guard(): Pose {
    return { handL: v3(-0.13, 1.45, 0.28), handR: v3(0.13, 1.45, 0.28), lean: new THREE.Vector2(), crouch: 0, headOffset: v3() }
  }

  static relaxed(): Pose {
    return { handL: v3(-0.24, 0.9, 0.06), handR: v3(0.24, 0.9, 0.06), lean: new THREE.Vector2(), crouch: 0, headOffset: v3() }
  }

  /** Local-space point at a given height, carried along by the upper-body lean. */
  private upper(x: number, y: number, z: number, hipY: number, lean: THREE.Vector2) {
    const k = Math.max(0, (y - hipY) / 0.5)
    return v3(x + lean.x * k, y, z + lean.y * k)
  }

  pose(p: Pose) {
    const b = this.look.bulk
    const hipY = p.seat ?? 0.92 - p.crouch
    const shoulderY = hipY + 0.45
    const L = this.limbs

    this.hips.position.copy(this.upper(0, hipY - 0.04, 0, hipY, p.lean))
    if (this.skirt) this.skirt.position.copy(this.upper(0, hipY + 0.06, 0, hipY, p.lean))
    this.torso.position.set(0, hipY, 0)
    this.torso.rotation.set(Math.atan2(p.lean.y, 0.5), 0, -Math.atan2(p.lean.x, 0.5))
    const neckBase = this.upper(0, shoulderY + 0.03, -0.005, hipY, p.lean)
    const headPos = this.upper(0, shoulderY + 0.18, 0.01, hipY, p.lean).add(p.headOffset)
    span(this.neck, neckBase, headPos.clone().add(v3(0, -0.08, -0.01)))
    this.neck.scale.x = this.neck.scale.z = b
    this.head.position.copy(headPos)
    this.head.rotation.set(-p.headOffset.z * 3 + p.lean.y * 0.3, 0, -p.headOffset.x * 4)

    const sides: [number, THREE.Vector3, "uaL" | "uaR", "faL" | "faR", 0 | 1][] = [
      [-1, p.handL, "uaL", "faL", 0],
      [1, p.handR, "uaR", "faR", 1],
    ]
    for (const [side, hand, ua, fa, i] of sides) {
      const shoulder = this.upper(side * 0.195 * b, shoulderY - 0.02, -0.01, hipY, p.lean)
      const elbow = joint(shoulder, hand, 0.29, 0.27, v3(side, -0.8, -0.4))
      const wrist = hand.clone().addScaledVector(hand.clone().sub(elbow).normalize(), -this.gloveR * 0.7)
      span(L[ua], shoulder, elbow)
      span(L[fa], elbow, wrist)
      if (this.joints.length) {
        this.joints[i].position.copy(shoulder)
        this.joints[i + 2].position.copy(elbow)
      }
      this.hands[i].position.copy(hand)
      this.hands[i].quaternion.setFromUnitVectors(v3(0, 0, 1), hand.clone().sub(elbow).normalize())
    }

    for (const [side, th, sh, i] of [
      [-1, "thL", "shL", 0],
      [1, "thR", "shR", 1],
    ] as const) {
      const hip = v3(side * 0.095 * b, hipY - 0.06, 0)
      const stride = (p.stride ?? 0) * side * 0.09
      const ankle = p.seat !== undefined ? v3(side * 0.13, 0.08, 0.4) : v3(side * 0.14, 0.08, side * 0.07 + stride)
      const knee = joint(hip, ankle, 0.44, 0.44, p.seat !== undefined ? v3(0, 1, 1) : v3(side * 0.2, 0, 1))
      span(L[th], hip, knee)
      span(L[sh], knee, ankle)
      this.feet[i].position.set(ankle.x, 0.035, ankle.z + 0.05)
    }
  }

  /** Straps a championship belt around the waist. */
  wearBelt(plate: string, strap: string) {
    if (this.belt) this.hips.remove(this.belt)
    const g = new THREE.Group()
    const b = this.look.bulk
    const strapMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.168 * b, 0.168 * b, 0.075, 20, 1, true), std(strap, { roughness: 0.5, side: THREE.DoubleSide }))
    const gold = std(plate, { metalness: 0.95, roughness: 0.2 })
    const plateMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 20), gold)
    plateMesh.rotation.x = Math.PI / 2
    plateMesh.position.set(0, 0, 0.17 * b)
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), std("#ff4d3d", { metalness: 0.3, roughness: 0.1, emissive: "#7a1f2b" }))
    gem.position.set(0, 0, 0.185 * b)
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.015), gold)
      side.position.set(s * 0.1 * b, 0, 0.14 * b)
      side.rotation.y = s * 0.6
      g.add(side)
    }
    g.add(strapMesh, plateMesh, gem)
    g.position.y = 0.06
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true))
    this.hips.add(g)
    this.belt = g
  }

  handWorld(i: 0 | 1) {
    return this.hands[i].getWorldPosition(v3())
  }

  headWorld() {
    return this.head.getWorldPosition(v3())
  }
}
