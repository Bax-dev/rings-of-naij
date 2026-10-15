import * as THREE from "three"
import { Avatar, FEMALE_FIGHTERS, boxerLook, canvasTexture, hashString, refereeLook, rng, seniorLook, spectatorLook, std, v3, type Pose } from "./avatar3d"
import { beltById } from "./belts"
import { DEFAULT_COACH, coachLook, cornerLook } from "./coaches"
import { applyCustom } from "./customize"
import { PUNCH_CONTACT, PUNCH_TIME, SPECIAL_CONTACT, type FightEngine, type FxEvent } from "./engine"
import { FxManager } from "./fx3d"
import { SIGNS, SIGN_COLORS, WALLS, themeFor, type StreetTheme } from "./render"

/** Ring floor height above the street, in metres. */
const R = 0.7
/** Half the distance between the corner posts. */
const POST = 2.55
/** How far from the centre a fighter may stand before the ropes stop them. */
const ROPES = 2.15
const ATTACK_COLORS = { jab: "#f5c400", hook: "#ff8a3d", uppercut: "#ff4d3d", power: "#ff4d3d" } as const
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : 1 - (1 - x) * (1 - x))
/** Angle of the line from player to opponent when the arena angle is 0: side by side across the camera. */
const BASE_ANGLE = Math.atan2(-0.6, 1.04)
const BEAM_COLORS = ["#ff4d3d", "#3a86ff", "#f5c400", "#1fb86a", "#e0457b", "#22c3b5"]
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/** The walk-out: down the aisle, up the ring steps, between the ropes and into the corner. sx -1 is the player's side. */
function walkPath(sx: 1 | -1) {
  const z = POST - 0.4
  const pts = [
    v3(sx * (POST + 4.5), 0, z),
    v3(sx * (POST + 1.95), 0, z),
    v3(sx * (POST + 0.35), R, z),
    v3(sx * (POST - 0.35), R, z - 0.1),
    v3(sx * (POST - 0.6), R, -sx * (POST - 0.6)),
  ]
  const lens = [0]
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, lens, total: lens[lens.length - 1], foot: lens[1] }
}
type WalkPath = ReturnType<typeof walkPath>

function pointAt(path: WalkPath, d: number) {
  const { pts, lens } = path
  d = Math.max(0, Math.min(path.total, d))
  let i = 1
  while (i < lens.length - 1 && lens[i] < d) i++
  const k = (d - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1])
  return { pos: pts[i - 1].clone().lerp(pts[i], k), ahead: pts[i].clone() }
}

/** Each corner's stool inside the ropes, and the coach's spot on the apron behind it. Index 0 is the player's. */
const CORNERS = ([-1, 1] as const).map((sx) => ({
  stool: v3(sx * (POST - 0.45), R, -sx * (POST - 0.45)),
  apron: v3(sx * (POST + 0.15), R, -sx * (POST + 0.15)),
}))

type Stage = "walk" | "corner" | "faceoff" | "seat"

type CrowdMove = "cheer" | "phone" | "clap" | "fold" | "point" | "dance"
interface Spectator {
  avatar: Avatar
  move: CrowdMove
  phase: number
  base: THREE.Vector3
}

interface Elder {
  avatar: Avatar
  phase: number
}

interface Beam {
  cone: THREE.Mesh
  origin: THREE.Vector3
  phase: number
}

/** Renders the fight as a real 3D scene on a WebGL canvas placed under the 2D effects canvas. */
export class Scene3D {
  private gl: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
  private el: HTMLCanvasElement
  private player: Avatar
  private opp: Avatar
  private ref: Avatar
  private coaches: [Avatar, Avatar]
  private stools: THREE.Mesh[] = []
  private paths = [walkPath(-1), walkPath(1)] as const
  /** Where each fighter and coach is drawn; eased towards their marks outside the action. */
  private shown: THREE.Vector3[] = [CORNERS[0].stool.clone(), CORNERS[1].stool.clone(), CORNERS[0].apron.clone(), CORNERS[1].apron.clone()]
  private lastPhase = ""
  /** Truss poles, faded out when one stands between the camera and the action. */
  private poles: THREE.Mesh[] = []
  private crowd: Spectator[] = []
  private elders: Elder[] = []
  private beams: Beam[] = []
  private beamLights: THREE.SpotLight[] = []
  private beatRing: THREE.Mesh
  private windupGlow: THREE.Mesh
  private auras: [THREE.Mesh, THREE.Mesh]
  private iceBlocks: [THREE.Mesh, THREE.Mesh]
  private stars: THREE.Mesh[] = []
  private bulbs: THREE.MeshStandardMaterial
  private fx: FxManager
  private seenFx = new WeakSet<FxEvent>()
  private size = { w: 1, h: 1 }
  private portrait = true
  private camPos = v3(0, 6, 8)
  private camAim = v3(0, R + 1, 0)
  private oppHeadCache = { x: 0, y: 0, guardY: 0 }
  private playerHeadCache = { x: 0, y: 0, guardY: 0 }
  private tmp = new THREE.Object3D()
  private overAt: number | null = null
  private confettiDone = false
  private nextFlash = 0

  constructor(
    overlay: HTMLCanvasElement,
    private e: FightEngine,
    private font: string,
  ) {
    this.el = document.createElement("canvas")
    this.el.setAttribute("aria-hidden", "true")
    Object.assign(this.el.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" })
    overlay.parentElement?.insertBefore(this.el, overlay)
    try {
      this.gl = new THREE.WebGLRenderer({ canvas: this.el, antialias: true, powerPreference: "high-performance" })
    } catch (err) {
      this.el.remove()
      throw err
    }
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.1
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap

    const cfg = e.config
    const f = cfg.fighter
    const o = cfg.opponent
    const theme = themeFor(o.venue)

    this.buildSky()
    this.buildLights()
    this.buildStreet(theme, o.venue)
    this.buildRing(o.venue)
    this.buildCrowd(hashString(o.venue))
    this.buildVip(hashString(o.venue) ^ 0x5eed)
    this.buildStageLights()
    this.bulbs = this.buildStringLights()
    this.fx = new FxManager(this.scene)

    const goldGloves = std("#f5c400", { metalness: 0.85, roughness: 0.25 })
    const ankara = cfg.cosmetics.ankaraTrunks
      ? std("#ffffff", {
          map: canvasTexture(128, 64, (g) => {
            g.fillStyle = "#e0457b"
            g.fillRect(0, 0, 128, 64)
            for (let i = 0; i < 8; i++) {
              g.fillStyle = i % 2 ? "#f5c400" : "#1fb86a"
              g.beginPath()
              g.moveTo(i * 16, 10)
              g.lineTo(i * 16 + 8, 26)
              g.lineTo(i * 16 + 16, 10)
              g.fill()
              g.fillStyle = "#14101f"
              g.beginPath()
              g.arc(i * 16 + 8, 42, 4, 0, Math.PI * 2)
              g.fill()
            }
          }),
        })
      : null

    const pLook = applyCustom(
      boxerLook(f.id, f.colors, {
        female: FEMALE_FIGHTERS.has(f.id),
        gloves: cfg.cosmetics.goldGloves ? goldGloves : std(f.colors.gloves, { roughness: 0.35 }),
        trunks: cfg.playerCustom?.trunks ? null : ankara,
        bulk: 0.92 + f.power * 0.1,
      }),
      cfg.playerCustom,
    )
    this.player = new Avatar(pLook, hashString(f.id))
    // Online, the opponent is another player's fighter; offline, a CPU boxer.
    const oppId = (cfg.oppFighter?.id ?? o.id).replace(/_cpu$/, "")
    const oppColors = cfg.oppFighter?.colors ?? o.colors
    const oLook = applyCustom(
      boxerLook(oppId, oppColors, {
        female: FEMALE_FIGHTERS.has(oppId),
        gloves: std(oppColors.gloves, { roughness: 0.35 }),
        bulk: 0.92 + (cfg.oppFighter?.power ?? o.power) * 0.1,
      }),
      cfg.oppCustom,
    )
    this.opp = new Avatar(oLook, hashString(oppId))
    const pb = beltById(cfg.playerBelt)
    if (pb) this.player.wearBelt(pb.plate, pb.strap)
    const ob = beltById(cfg.oppBelt)
    if (ob) this.opp.wearBelt(ob.plate, ob.strap)
    this.ref = new Avatar(refereeLook(), 99)
    this.coaches = [new Avatar(coachLook(cfg.coach ?? DEFAULT_COACH), 41), new Avatar(cornerLook(o.colors), 42)]
    this.scene.add(this.player.root, this.opp.root, this.ref.root, ...this.coaches.map((c) => c.root))
    const stoolMat = std("#14101f", { roughness: 0.6 })
    for (const c of CORNERS) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.46, 12), stoolMat)
      stool.position.copy(c.stool).add(v3(0, 0.23, 0))
      stool.castShadow = true
      stool.visible = false
      this.stools.push(stool)
      this.scene.add(stool)
    }

    this.beatRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.56, 48),
      new THREE.MeshBasicMaterial({ color: "#f5c400", transparent: true, opacity: 0.4, depthWrite: false }),
    )
    this.beatRing.rotation.x = -Math.PI / 2
    this.scene.add(this.beatRing)

    const glow = (color: string, r: number) =>
      new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
    this.windupGlow = glow("#f5c400", 0.16)
    this.windupGlow.visible = false
    this.auras = [glow(e.playerPower.color, 0.6), glow(e.oppPower.color, 0.6)]
    for (const a of this.auras) {
      a.scale.set(1, 1.6, 1)
      a.visible = false
    }
    const ice = () => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.48, 2.0, 7),
        new THREE.MeshStandardMaterial({ color: "#bff6ff", transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1, emissive: "#3aa6c8", emissiveIntensity: 0.3 }),
      )
      m.visible = false
      return m
    }
    this.iceBlocks = [ice(), ice()]
    this.scene.add(this.windupGlow, ...this.auras, ...this.iceBlocks)

    const starMat = new THREE.MeshBasicMaterial({ color: "#f5c400" })
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), starMat)
      s.visible = false
      this.stars.push(s)
      this.scene.add(s)
    }
  }

  // ---------- scenery ----------

  private buildSky() {
    this.scene.background = canvasTexture(4, 256, (g) => {
      const sky = g.createLinearGradient(0, 0, 0, 256)
      sky.addColorStop(0, "#120c24")
      sky.addColorStop(0.4, "#3a1f4d")
      sky.addColorStop(0.75, "#a8483f")
      sky.addColorStop(1, "#e08a3c")
      g.fillStyle = sky
      g.fillRect(0, 0, 4, 256)
    })
    this.scene.fog = new THREE.Fog("#4a2a4a", 18, 60)
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#ffd9b0", "#2a1d3a", 1.4))
    const sun = new THREE.DirectionalLight("#ff9f60", 1.2)
    sun.position.set(-10, 8, -14)
    this.scene.add(sun)

    const spot = new THREE.SpotLight("#fff1d6", 260, 30, 0.6, 0.5, 1.6)
    spot.position.set(0.5, 10, 2.5)
    spot.target.position.set(0, R, 0)
    spot.castShadow = true
    spot.shadow.mapSize.set(1024, 1024)
    spot.shadow.bias = -0.0005
    this.scene.add(spot, spot.target)
  }

  private buildStreet(theme: StreetTheme, venue: string) {
    let seed = 7
    for (const ch of venue) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483646
    seed = seed || 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]

    // Tarmac with a faded centre line, and a raised kerb on each side.
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      std("#ffffff", {
        map: canvasTexture(256, 256, (g) => {
          g.fillStyle = "#2b2733"
          g.fillRect(0, 0, 256, 256)
          for (let i = 0; i < 900; i++) {
            g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
            g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
          }
        }),
        roughness: 0.95,
      }),
    )
    ;(road.material as THREE.MeshStandardMaterial).map!.wrapS = THREE.RepeatWrapping
    ;(road.material as THREE.MeshStandardMaterial).map!.wrapT = THREE.RepeatWrapping
    ;(road.material as THREE.MeshStandardMaterial).map!.repeat.set(16, 16)
    road.rotation.x = -Math.PI / 2
    road.receiveShadow = true
    this.scene.add(road)
    const lineMat = std("#e8d9a0", { roughness: 0.9 })
    for (let x = -30; x < 30; x += 3) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14), lineMat)
      dash.rotation.x = -Math.PI / 2
      dash.position.set(x, 0.01, -7.5)
      this.scene.add(dash)
    }
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(80, 0.18, 2.4), std("#6b6470"))
    kerb.position.set(0, 0.09, -11)
    kerb.receiveShadow = true
    this.scene.add(kerb)

    // Distant high-rises in the haze.
    const towerTex = canvasTexture(64, 128, (g) => {
      g.fillStyle = "#2b1d44"
      g.fillRect(0, 0, 64, 128)
      for (let y = 4; y < 124; y += 6) for (let x = 3; x < 60; x += 6) if (Math.random() > 0.72) {
        g.fillStyle = "rgba(255,214,120,0.9)"
        g.fillRect(x, y, 3, 3)
      }
    })
    const towerMat = std("#ffffff", { map: towerTex, emissive: "#ffffff", emissiveMap: towerTex, emissiveIntensity: 0.35 })
    const towers = theme === "skyline" ? 14 : 8
    for (let i = 0; i < towers; i++) {
      const h = (theme === "skyline" ? 18 : 10) + rand() * 22
      const tw = 4 + rand() * 5
      const t = new THREE.Mesh(new THREE.BoxGeometry(tw, h, tw), towerMat)
      t.position.set(-40 + rand() * 80, h / 2, -32 - rand() * 14)
      this.scene.add(t)
    }

    // Street-front buildings along the back and both sides of the ring.
    const signs = [...SIGNS[theme]]
    let venuePlaced = false
    const row = (axis: "back" | "left" | "right") => {
      let u = axis === "back" ? -22 : -12
      const end = axis === "back" ? 22 : 4
      while (u < end) {
        const bw = 4 + rand() * 3.5
        const floors = theme === "skyline" ? 3 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3)
        const isVenue = axis === "back" && !venuePlaced && u > -3
        if (isVenue) venuePlaced = true
        const sign = isVenue ? venue.toUpperCase() : signs.length ? signs.splice(Math.floor(rand() * signs.length), 1)[0] : pick(SIGNS[theme])
        const b = this.building(bw, floors, pick(WALLS), sign, isVenue ? "#f5c400" : pick(SIGN_COLORS), rand)
        if (axis === "back") b.position.set(u + bw / 2, 0, -14.5)
        else {
          b.rotation.y = axis === "left" ? Math.PI / 2 : -Math.PI / 2
          b.position.set(axis === "left" ? -10.5 : 10.5, 0, u + bw / 2)
        }
        this.scene.add(b)
        u += bw + 0.15
      }
    }
    row("back")
    row("left")
    row("right")

    // Power poles with sagging wires.
    const poleMat = std("#3a2f2a", { roughness: 0.9 })
    const wireMat = new THREE.LineBasicMaterial({ color: "#0d0818" })
    const poles = [-12, -4, 4, 12]
    for (const x of poles) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 8, 8), poleMat)
      pole.position.set(x, 4, -10)
      pole.castShadow = true
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), poleMat)
      bar.position.set(x, 7.6, -10)
      this.scene.add(pole, bar)
    }
    for (let i = 0; i < poles.length - 1; i++) {
      for (const off of [-0.7, 0, 0.7]) {
        const pts: THREE.Vector3[] = []
        for (let k = 0; k <= 12; k++) {
          const u = k / 12
          pts.push(v3(poles[i] + off + (poles[i + 1] - poles[i]) * u, 7.6 - Math.sin(u * Math.PI) * 0.8, -10))
        }
        this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat))
      }
    }

    // Street lamps throwing warm light on the road.
    for (const x of [-7, 7]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.5, 8), std("#55505c", { metalness: 0.6 }))
      pole.position.set(x, 2.75, -9)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), pole.material)
      arm.position.set(x, 5.45, -8.5)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.25), std("#fff1c9", { emissive: "#ffd28a", emissiveIntensity: 3 }))
      lamp.position.set(x, 5.38, -8)
      const light = new THREE.PointLight("#ffbf6e", 30, 14, 1.6)
      light.position.set(x, 5.1, -8)
      this.scene.add(pole, arm, lamp, light)
    }

    // Vehicles and stalls.
    this.scene.add(this.danfo(-6 + rand() * 4, -7.2, rand() > 0.5 ? 0 : Math.PI))
    this.scene.add(this.danfo(5 + rand() * 6, -8.2, Math.PI))
    if (theme !== "skyline") this.scene.add(this.keke(-1 + rand() * 4, -9.6))
    if (theme === "market" || theme === "gadgets") {
      for (let x = -14; x < 14; x += 2.6 + rand() * 1.5) this.scene.add(this.umbrella(x, -12.2, pick(["#ff4d3d", "#3a86ff", "#f5c400", "#1fb86a"])))
    }
    if (theme === "bridge") this.scene.add(this.overpass())
  }

  private building(bw: number, floors: number, wall: string, sign: string, signColor: string, rand: () => number) {
    const floorH = 2.8
    const bh = floorH * (floors + 1)
    const pxW = 256
    const pxH = Math.round((256 * bh) / bw)
    const lit: [number, number][] = []
    const paint = (g: CanvasRenderingContext2D, emissive: boolean) => {
      g.fillStyle = emissive ? "#000000" : wall
      g.fillRect(0, 0, pxW, pxH)
      if (!emissive) {
        g.fillStyle = "rgba(24,12,44,0.28)"
        g.fillRect(0, 0, pxW, pxH)
        for (let i = 0; i < 300; i++) {
          g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`
          g.fillRect(Math.random() * pxW, Math.random() * pxH, 6, 6)
        }
      }
      const fpx = pxH / (floors + 1)
      for (let f = 0; f < floors; f++) {
        const y = f * fpx + fpx * 0.2
        let i = 0
        for (let x = 18; x < pxW - 40; x += 58) {
          const on = emissive ? lit.some(([a, b]) => a === f && b === i) : false
          if (!emissive) {
            g.fillStyle = "rgba(10,6,20,0.85)"
            g.fillRect(x, y, 36, fpx * 0.5)
            g.fillStyle = "rgba(0,0,0,0.4)"
            for (let ly = y + 3; ly < y + fpx * 0.5; ly += 5) g.fillRect(x, ly, 36, 2)
            g.fillStyle = "rgba(230,220,200,0.6)"
            g.fillRect(x - 3, y + fpx * 0.5, 42, 4)
          } else if (on) {
            g.fillStyle = "rgba(255,180,90,0.8)"
            g.fillRect(x, y, 36, fpx * 0.5)
            g.fillStyle = "rgba(0,0,0,0.5)"
            for (let ly = y + 3; ly < y + fpx * 0.5; ly += 5) g.fillRect(x, ly, 36, 2)
          }
          i++
        }
        if (!emissive && (f + floors) % 2 === 0) {
          g.strokeStyle = "rgba(230,220,200,0.7)"
          g.lineWidth = 3
          const by = y + fpx * 0.62
          g.strokeRect(8, by, pxW - 16, fpx * 0.25)
          for (let rx = 14; rx < pxW - 8; rx += 12) {
            g.beginPath()
            g.moveTo(rx, by)
            g.lineTo(rx, by + fpx * 0.25)
            g.stroke()
          }
        }
      }
      // Shop front and its hand-painted sign.
      const shopTop = pxH - fpx
      g.fillStyle = emissive ? "rgba(255,150,60,0.45)" : "rgba(40,24,30,0.9)"
      g.fillRect(10, shopTop + fpx * 0.35, pxW - 20, fpx * 0.65)
      const signH = fpx * 0.28
      g.fillStyle = emissive ? "rgba(255,255,255,0.35)" : signColor
      g.fillRect(4, shopTop + fpx * 0.04, pxW - 8, signH)
      g.fillStyle = signColor === "#ffffff" || signColor === "#f5c400" ? "#14101f" : "#ffffff"
      if (emissive) g.fillStyle = "rgba(0,0,0,0.6)"
      g.textAlign = "center"
      g.textBaseline = "middle"
      g.font = `${Math.min(signH * 0.78, ((pxW - 16) / Math.max(4, sign.length)) * 1.6)}px ${this.font}`
      g.fillText(sign, pxW / 2, shopTop + fpx * 0.04 + signH / 2 + 2, pxW - 16)
    }
    for (let f = 0; f < floors; f++) for (let i = 0; i < 4; i++) if (rand() > 0.5) lit.push([f, i])
    const map = canvasTexture(pxW, pxH, (g) => paint(g, false))
    const emissiveMap = canvasTexture(pxW, pxH, (g) => paint(g, true))
    const face = std("#ffffff", { map, emissive: "#ffffff", emissiveMap, emissiveIntensity: 0.9 })
    const plain = std(wall)
    const box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 5), [plain, plain, std("#3a3340"), plain, face, plain])
    box.position.y = bh / 2
    box.receiveShadow = true
    const group = new THREE.Group()
    group.add(box)
    if (rand() > 0.45) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), std("#1b1530"))
      tank.position.set(bw * 0.2, bh + 0.5, 0)
      group.add(tank)
    } else {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 0.15, 5.4), std("#6b6058", { metalness: 0.4, roughness: 0.6 }))
      roof.position.y = bh + 0.08
      roof.rotation.x = 0.12
      group.add(roof)
    }
    // Awning over the shop front.
    const awning = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, 0.06, 0.9), std(signColor === "#ffffff" ? "#3a86ff" : signColor))
    awning.position.set(0, floorH * 0.62, 2.9)
    awning.rotation.x = 0.25
    group.add(awning)
    return group
  }

  private danfo(x: number, z: number, rot: number) {
    const g = new THREE.Group()
    const yellow = std("#f2b705", { roughness: 0.5 })
    const black = std("#14101f")
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 1.9), yellow)
    body.position.y = 1.15
    body.castShadow = true
    const windows = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.5, 1.92), std("#1e2a3c", { roughness: 0.2, metalness: 0.5 }))
    windows.position.y = 1.55
    for (const y of [0.85, 0.65]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.22, 0.1, 1.92), black)
      stripe.position.y = y
      g.add(stripe)
    }
    g.add(body, windows)
    for (const [wx, wz] of [
      [-1.4, 0.95],
      [1.4, 0.95],
      [-1.4, -0.95],
      [1.4, -0.95],
    ]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14), black)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(wx, 0.36, wz)
      g.add(wheel)
    }
    g.position.set(x, 0, z)
    g.rotation.y = rot
    return g
  }

  private keke(x: number, z: number) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.1), std("#1fb86a", { roughness: 0.5 }))
    body.position.y = 1
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 1.12), std("#f5c400"))
    stripe.position.y = 0.75
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.2), std("#14101f"))
    roof.position.y = 1.64
    g.add(body, stripe, roof)
    for (const [wx, wz] of [
      [0.6, 0],
      [-0.55, 0.5],
      [-0.55, -0.5],
    ]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12), std("#0b0814"))
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(wx, 0.22, wz)
      g.add(wheel)
    }
    g.position.set(x, 0, z)
    return g
  }

  private umbrella(x: number, z: number, color: string) {
    const g = new THREE.Group()
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.45, 12, 1, true), std(color, { side: THREE.DoubleSide }))
    canopy.position.y = 2.1
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6), std("#2a2230"))
    pole.position.y = 1.05
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.7), std("#6b4428"))
    table.position.y = 0.4
    const goods = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 0.5), std(pick2(color)))
    goods.position.y = 0.88
    g.add(canopy, pole, table, goods)
    g.position.set(x, 0, z)
    return g
  }

  private overpass() {
    const g = new THREE.Group()
    const concrete = std("#5a5262", { roughness: 0.9 })
    const deck = new THREE.Mesh(new THREE.BoxGeometry(80, 0.9, 5), concrete)
    deck.position.set(0, 7, -10)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(80, 0.5, 0.15), std("#7a7286"))
    rail.position.set(0, 7.7, -7.6)
    g.add(deck, rail)
    for (let x = -30; x <= 30; x += 10) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.6, 1.4), concrete)
      pillar.position.set(x, 3.3, -10)
      pillar.castShadow = true
      g.add(pillar)
    }
    for (let i = 0; i < 3; i++) {
      const bus = this.danfo(-12 + i * 9, 0, 0)
      bus.position.y = 7.45
      bus.position.z = -10.8
      bus.scale.setScalar(0.9)
      g.add(bus)
    }
    return g
  }

  private buildRing(venue: string) {
    const mat = canvasTexture(512, 512, (g) => {
      g.fillStyle = "#3b3a72"
      g.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 2000; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`
        g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3)
      }
      g.strokeStyle = "rgba(255,255,255,0.5)"
      g.lineWidth = 6
      g.strokeRect(22, 22, 468, 468)
      g.strokeStyle = "rgba(31,184,106,0.6)"
      g.lineWidth = 14
      g.beginPath()
      g.arc(256, 256, 120, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = "rgba(255,255,255,0.18)"
      g.font = `64px ${this.font}`
      g.textAlign = "center"
      g.textBaseline = "middle"
      g.fillText("EKO", 256, 256)
    })
    const skirt = canvasTexture(1024, 128, (g) => {
      g.fillStyle = "#0f5a36"
      g.fillRect(0, 0, 1024, 128)
      g.fillStyle = "#ffffff"
      g.fillRect(0, 0, 1024, 10)
      g.font = `70px ${this.font}`
      g.textAlign = "center"
      g.textBaseline = "middle"
      g.fillText(venue.toUpperCase(), 512, 70, 980)
    })
    const side = std("#ffffff", { map: skirt })
    const top = std("#ffffff", { map: mat, roughness: 0.9 })
    const platform = new THREE.Mesh(new THREE.BoxGeometry(POST * 2 + 0.6, R, POST * 2 + 0.6), [side, side, top, side, side, side])
    platform.position.y = R / 2
    platform.receiveShadow = true
    platform.castShadow = true
    this.scene.add(platform)

    const metal = std("#d8d6d0", { metalness: 0.8, roughness: 0.3 })
    const ropeHeights = [0.45, 0.8, 1.15]
    const ropeColors = ["#1fb86a", "#ffffff", "#1fb86a"]
    const corners: [number, number, string][] = [
      [-POST, -POST, "#ff4d3d"],
      [POST, -POST, "#ffffff"],
      [POST, POST, "#3a86ff"],
      [-POST, POST, "#ffffff"],
    ]
    for (const [x, z, color] of corners) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 12), metal)
      post.position.set(x, R + 0.7, z)
      post.castShadow = true
      this.scene.add(post)
      const pad = std(color, { roughness: 0.5 })
      for (const ry of ropeHeights) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), pad)
        p.position.set(x - Math.sign(x) * 0.08, R + ry, z - Math.sign(z) * 0.08)
        p.rotation.y = Math.PI / 4
        this.scene.add(p)
      }
    }
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i]
      const [bx, bz] = corners[(i + 1) % 4]
      ropeHeights.forEach((ry, k) => {
        const a = v3(ax, R + ry, az)
        const b = v3(bx, R + ry, bz)
        const mid = a.clone().lerp(b, 0.5)
        mid.y -= 0.05
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, 0.028, 8),
          std(ropeColors[k], { roughness: 0.45 }),
        )
        tube.castShadow = true
        this.scene.add(tube)
      })
    }

    // Ring steps on both near corners, one for each fighter's walk-out.
    const stepMat = std("#2b2733")
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1, (R / 3) * (i + 1), 0.4), stepMat)
        step.position.set(sx * (POST + 0.3 + 0.4 * (2 - i) + 0.25), ((R / 3) * (i + 1)) / 2, POST - 0.4)
        this.scene.add(step)
      }
    }
  }

  /** Spectators at street level around the ring. Every one is a different person. */
  private buildCrowd(seed: number) {
    const r = rng(seed)
    const edge = POST + 1.0
    const spots: THREE.Vector3[] = []
    for (let x = -edge - 0.6; x <= edge + 0.6; x += 0.85) spots.push(v3(x + r.range(-0.15, 0.15), 0, -edge - r.range(0, 0.6)))
    for (const sx of [-1, 1]) for (let z = -edge + 0.9; z <= 1.6; z += 1.0) spots.push(v3(sx * (edge + 0.9 + r.range(0, 0.3)), 0, z))
    const moves: CrowdMove[] = ["cheer", "phone", "clap", "fold", "point", "dance"]
    for (const base of spots) {
      const avatar = new Avatar(spectatorLook(Math.floor(r.next() * 1e9)), Math.floor(r.next() * 1e9))
      avatar.root.position.copy(base)
      avatar.root.lookAt(0, 0, 0)
      const move = r.pick(moves)
      if (move === "phone") {
        const phone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.12), std("#0b0814", { roughness: 0.2, metalness: 0.5 }))
        avatar.handProp.add(phone)
      }
      this.scene.add(avatar.root)
      this.crowd.push({ avatar, move, phase: r.next(), base })
    }
  }

  private poseCrowd(t: number, beatPhase: number) {
    const ko = this.e.phase === "over"
    for (const s of this.crowd) {
      const p = Avatar.relaxed()
      const beat = Math.abs(Math.sin((beatPhase + s.phase) * Math.PI))
      const move = ko ? "cheer" : s.move
      if (move === "cheer") {
        p.handL.set(-0.2, 1.75 + beat * 0.12, 0.08)
        p.handR.set(0.2, 1.75 + (1 - beat) * 0.12, 0.08)
      } else if (move === "phone") {
        p.handR.set(0.08, 1.55, 0.3)
        p.handL.set(-0.2, 1.0, 0.12)
      } else if (move === "clap") {
        const open = Math.sin(t * 14 + s.phase * 6) * 0.06
        p.handL.set(-0.04 - open, 1.25, 0.3)
        p.handR.set(0.04 + open, 1.25, 0.3)
      } else if (move === "fold") {
        p.handL.set(0.1, 1.15, 0.2)
        p.handR.set(-0.1, 1.18, 0.21)
      } else if (move === "point") {
        p.handR.set(0.15, 1.5, 0.55)
        p.handL.set(-0.22, 0.95, 0.1)
      } else {
        p.handL.set(-0.28, 1.3 + beat * 0.2, 0.15)
        p.handR.set(0.28, 1.5 - beat * 0.2, 0.15)
        p.lean.set(Math.sin((beatPhase + s.phase) * Math.PI * 2) * 0.06, 0)
      }
      p.crouch = move === "dance" || move === "cheer" ? beat * 0.05 : 0
      s.avatar.root.position.y = s.base.y + (move === "cheer" ? beat * 0.06 : 0)
      s.avatar.pose(p)
    }
  }

  /** Coloured bulbs strung over the ring. Their brightness pulses on the beat. */
  private buildStringLights() {
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.5 })
    const colors = ["#f5c400", "#ff4d3d", "#1fb86a", "#22c3b5"]
    const strings: [THREE.Vector3, THREE.Vector3][] = [
      [v3(-9, 6.5, -10), v3(-3, 5.5, 6)],
      [v3(9, 6.5, -10), v3(3, 5.5, 6)],
      [v3(-10, 6, -4), v3(10, 6, -4)],
    ]
    const per = 18
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), mat, strings.length * per)
    const c = new THREE.Color()
    let n = 0
    for (const [a, b] of strings) {
      const wire: THREE.Vector3[] = []
      for (let i = 0; i <= per; i++) {
        const u = i / per
        const p = a.clone().lerp(b, u)
        p.y -= Math.sin(u * Math.PI) * 1.2
        wire.push(p)
        if (i < per) {
          this.tmp.position.copy(p)
          this.tmp.position.y -= 0.1
          this.tmp.updateMatrix()
          mesh.setMatrixAt(n, this.tmp.matrix)
          mesh.setColorAt(n, c.set(colors[n % colors.length]))
          n++
        }
      }
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: "#0d0818" })))
    }
    this.scene.add(mesh)
    return mat
  }

  /** Elders in their best suits and agbadas, seated in the VIP chairs at ringside. */
  private buildVip(seed: number) {
    const r = rng(seed)
    const velvet = std("#7a1f2b", { roughness: 0.9 })
    const gold = std("#c9a24a", { metalness: 0.8, roughness: 0.3 })
    for (const sx of [-1, 1]) {
      for (const z of [-0.9, 0.2, 1.3]) {
        const x = sx * 3.3
        const chair = new THREE.Group()
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), velvet)
        seat.position.y = 0.43
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), velvet)
        back.position.set(0, 0.75, -0.24)
        chair.add(seat, back)
        for (const [lx, lz] of [
          [-0.22, -0.22],
          [0.22, -0.22],
          [-0.22, 0.22],
          [0.22, 0.22],
        ]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.43, 6), gold)
          leg.position.set(lx, 0.215, lz)
          chair.add(leg)
        }
        chair.position.set(x, 0, z)
        chair.lookAt(0, 0, z * 0.3)
        this.scene.add(chair)
        const avatar = new Avatar(seniorLook(Math.floor(r.next() * 1e9)), Math.floor(r.next() * 1e9))
        avatar.root.position.set(x, 0, z)
        avatar.root.lookAt(0, 0, z * 0.3)
        avatar.root.translateZ(0.02)
        this.scene.add(avatar.root)
        this.elders.push({ avatar, phase: r.next() })
      }
    }
  }

  /** Moving concert beams on trusses over the ring, plus two coloured spotlights that follow them. */
  private buildStageLights() {
    const truss = std("#2a2530", { metalness: 0.7, roughness: 0.4 })
    const H = 7
    for (const [x, z] of [
      [-3.4, -3.4],
      [3.4, -3.4],
      [-3.4, 3.4],
      [3.4, 3.4],
    ]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, 0.18), truss.clone())
      pole.position.set(x, H / 2, z)
      this.poles.push(pole)
      this.scene.add(pole)
    }
    for (const z of [-3.4, 3.4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 0.18), truss)
      bar.position.set(0, H, z)
      this.scene.add(bar)
    }
    const cone = new THREE.ConeGeometry(0.9, 1, 24, 1, true)
    cone.translate(0, -0.5, 0)
    const origins = [v3(-2.4, H, -3.4), v3(-0.8, H, -3.4), v3(0.8, H, -3.4), v3(2.4, H, -3.4), v3(-1.6, H, 3.4), v3(1.6, H, 3.4)]
    origins.forEach((origin, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: BEAM_COLORS[i],
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const m = new THREE.Mesh(cone, mat)
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 10), truss)
      head.position.copy(origin).add(v3(0, -0.2, 0))
      this.scene.add(m, head)
      this.beams.push({ cone: m, origin, phase: i * 1.3 })
    })
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(BEAM_COLORS[i], 90, 16, 0.32, 0.6, 1.4)
      s.position.copy(origins[i * 3])
      this.scene.add(s, s.target)
      this.beamLights.push(s)
    }
  }

  // ---------- per frame ----------

  resize(w: number, h: number, dpr: number) {
    this.size = { w, h }
    this.gl.setPixelRatio(Math.min(dpr, 1.75))
    this.gl.setSize(w, h, false)
    const aspect = w / h
    this.camera.aspect = aspect
    this.portrait = aspect < 0.75
    // Portrait phones need a wider lens to keep both fighters and the referee in frame.
    this.camera.fov = this.portrait ? 46 : 36
    this.camera.updateProjectionMatrix()
  }

  /** Screen position of the opponent's face and guard, in CSS px. Punch effects spawn here. */
  oppHead() {
    return this.oppHeadCache
  }

  playerHead() {
    return this.playerHeadCache
  }

  private toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera)
    return { x: ((v.x + 1) / 2) * this.size.w, y: ((1 - v.y) / 2) * this.size.h }
  }

  private lastT = 0

  render() {
    const e = this.e
    const t = e.t
    const dt = Math.max(0, Math.min(0.1, t - this.lastT))
    this.lastT = t
    const beatPhase = e.beatPhase()
    const pulse = Math.pow(1 - beatPhase, 3)
    const bob = Math.sin(beatPhase * Math.PI * 2) * 0.015
    const over = e.phase === "over"
    if (over && this.overAt === null) this.overAt = t
    const knockdown = this.overAt === null || !e.matchKo ? 0 : Math.min(1, (t - this.overAt) / 0.6)
    const fighting = e.phase === "fight"

    // --- where everyone stands ---
    const a = e.arena
    const ang = BASE_ANGLE + a.angle
    const dir = v3(Math.cos(ang), 0, Math.sin(ang))
    const center = v3(a.cx, R, a.cz)
    const half = a.dist / 2
    const pPos = center.clone().addScaledVector(dir, -(half + a.playerPush))
    const oPos = center.clone().addScaledVector(dir, half + a.oppPush)
    for (const q of [pPos, oPos]) {
      q.x = Math.max(-ROPES, Math.min(ROPES, q.x))
      q.z = Math.max(-ROPES, Math.min(ROPES, q.z))
    }
    const stages = this.placeFighters(t, dt, center, dir, pPos, oPos)
    const [pStage, oStage] = stages
    const hop = fighting ? Math.abs(Math.sin(beatPhase * Math.PI)) * 0.025 : 0
    this.player.root.position.y += hop
    this.opp.root.position.y += hop
    this.player.root.updateMatrixWorld(true)
    this.opp.root.updateMatrixWorld(true)

    // --- opponent first, so the player's punches aim at where the face really is this frame ---
    const o = e.opp
    const op = Avatar.guard()
    op.handL.y += bob
    op.handR.y += bob
    let oppFall = 0
    this.windupGlow.visible = false
    this.auras[1].visible = false
    const playerHeadRest = this.player.root.localToWorld(v3(0, 1.55, 0.05))
    const oppFrozen = t < o.frozenUntil
    const oppLost = over && (e.matchKo ? o.hp <= 0 : e.matchWon)
    if (oStage) this.stagePose(op, oStage, t, 1)
    else if (over && o.hp <= 0) oppFall = knockdown
    else if (oppLost) {
      op.handL.set(-0.22, 0.95, 0.1)
      op.handR.set(0.22, 0.95, 0.1)
      op.headOffset.set(0, -0.04, 0.03)
    } else if (over) {
      this.celebrate(op, t)
    } else if (oppFrozen) {
      // Frozen solid mid-guard.
    } else if (o.state === "windup") {
      const prog = ease((t - o.stateStart) / Math.max(0.01, o.stateEnd - o.stateStart))
      if (o.attack === "power") {
        op.handL.set(-0.3 * prog - 0.13, 1.35 + 0.2 * prog, 0.28 - 0.4 * prog)
        op.handR.set(0.3 * prog + 0.13, 1.35 + 0.2 * prog, 0.28 - 0.4 * prog)
        op.lean.set(0, -0.08 * prog)
        this.auras[1].visible = true
        this.auras[1].position.copy(this.opp.root.position).add(v3(0, 1.0, 0))
        ;(this.auras[1].material as THREE.MeshBasicMaterial).opacity = 0.15 + prog * 0.25 + Math.sin(t * 30) * 0.05
      } else {
        const low = o.attack === "uppercut" ? -0.45 : o.attack === "hook" ? -0.05 : 0
        const wide = o.attack === "hook" ? 0.4 : 0.28
        const back = v3(o.side * wide * prog + o.side * 0.13 * (1 - prog), 1.45 + low * prog, 0.28 - 0.35 * prog)
        if (o.side === 1) op.handR = back
        else op.handL = back
        op.lean.set(-o.side * 0.06 * prog, -0.05 * prog)
        this.windupGlow.visible = true
        const glowMat = this.windupGlow.material as THREE.MeshBasicMaterial
        glowMat.color.set(ATTACK_COLORS[o.attack])
        glowMat.opacity = 0.35 + prog * 0.4
        this.windupGlow.scale.setScalar(1 + prog * 0.6 + Math.sin(t * 30) * 0.08)
      }
    } else if (o.state === "strike") {
      const prog = ease((t - o.stateStart) / 0.09)
      const target = this.opp.root.worldToLocal(playerHeadRest.clone())
      if (o.attack === "power") {
        op.handL = v3(-0.08, 1.45, 0.28).lerp(target.clone().add(v3(-0.08, 0, 0)), prog)
        op.handR = v3(0.08, 1.45, 0.28).lerp(target.clone().add(v3(0.08, 0, 0)), prog)
        op.lean.set(0, 0.2 * prog)
      } else {
        const hand = v3(o.side * 0.13, 1.45, 0.28).lerp(target, prog)
        if (o.side === 1) op.handR = hand
        else op.handL = hand
        op.lean.set(o.side * 0.05, 0.18 * prog)
      }
    } else if (o.state === "recover" || o.state === "stagger") {
      op.handL.set(-0.26, 1.05, 0.12)
      op.handR.set(0.26, 1.05, 0.12)
      op.lean.set(o.state === "stagger" ? Math.sin(t * 9) * 0.1 : 0, -0.08)
    } else if (o.blocking || t - o.guardFlash < 0.25) {
      op.handL.set(-0.07, 1.6, 0.24)
      op.handR.set(0.07, 1.6, 0.24)
    }
    if (!over && t < o.dodgeUntil) {
      const k = Math.sin(Math.min(1, 1 - (o.dodgeUntil - t) / 0.4) * Math.PI)
      if (o.dodgeDir === "up") op.lean.set(0.38 * k, -0.06 * k)
      else op.crouch = 0.3 * k
    }
    if (!over && t - o.stepAt < 0.3) op.stride = Math.sin(((t - o.stepAt) / 0.3) * Math.PI) * o.stepDir
    else if (fighting) op.stride = Math.sin(beatPhase * Math.PI * 2) * 0.25
    const hurt = t - o.hitFlash < 0.18 && t - o.guardFlash > 0.2
    if (hurt) {
      const k = 1 - (t - o.hitFlash) / 0.18
      op.headOffset.set(-o.hitSide * 0.07 * k, 0.02 * k, -0.06 * k)
      op.lean.y -= 0.06 * k
    }
    this.opp.pose(op)
    this.fall(this.opp, oppFall)
    this.opp.root.updateMatrixWorld(true)
    if (this.windupGlow.visible) this.windupGlow.position.copy(this.opp.handWorld(o.side === 1 ? 1 : 0))

    const headWorld = this.opp.headWorld()
    const headRest = this.opp.root.localToWorld(v3(0, 1.55, 0.05))
    const guardWorld = this.opp.handWorld(0).lerp(this.opp.handWorld(1), 0.5)

    // --- player ---
    const p = e.player
    const pp = Avatar.guard()
    const sway = Math.sin(beatPhase * Math.PI * 2) * 0.02
    pp.handL.y += sway
    pp.handR.y -= sway
    let playerFall = 0
    this.auras[0].visible = false
    const playerLost = over && (e.matchKo ? p.hp <= 0 : !e.matchWon)
    this.player.root.visible = this.walkerVisible(0, t)
    if (pStage) this.stagePose(pp, pStage, t, 0)
    else if (over && p.hp <= 0) playerFall = knockdown
    else if (playerLost) {
      pp.handL.set(-0.22, 0.95, 0.1)
      pp.handR.set(0.22, 0.95, 0.1)
      pp.headOffset.set(0, -0.04, 0.03)
    } else if (over) {
      this.celebrate(pp, t)
    } else if (t < p.frozenUntil) {
      // Frozen solid.
    } else if (p.action === "dodgeUp" || p.action === "dodgeDown") {
      const prog = (t - p.actionStart) / Math.max(0.01, p.actionEnd - p.actionStart)
      const curve = Math.sin(Math.min(1, prog) * Math.PI)
      if (p.action === "dodgeUp") pp.lean.set(-0.42 * curve, -0.05 * curve)
      else pp.crouch = 0.32 * curve
      pp.handL.y -= pp.crouch
      pp.handR.y -= pp.crouch
      pp.handL.x += pp.lean.x
      pp.handR.x += pp.lean.x
    } else if (p.action === "windupL" || p.action === "windupR") {
      const side = p.action === "windupL" ? -1 : 1
      const prog = ease((t - p.actionStart) / Math.max(0.01, p.actionEnd - p.actionStart))
      const back = v3(side * (0.13 + 0.15 * prog), 1.42, 0.28 - 0.3 * prog)
      if (side === -1) pp.handL = back
      else pp.handR = back
      pp.lean.set(-side * 0.05 * prog, -0.04 * prog)
    } else if (p.action === "charge") {
      const prog = ease((t - p.actionStart) / Math.max(0.01, p.actionEnd - p.actionStart))
      pp.handL.set(-0.13 - 0.3 * prog, 1.35 + 0.2 * prog, 0.28 - 0.4 * prog)
      pp.handR.set(0.13 + 0.3 * prog, 1.35 + 0.2 * prog, 0.28 - 0.4 * prog)
      pp.lean.set(0, -0.08 * prog)
      this.auras[0].visible = true
      this.auras[0].position.copy(this.player.root.position).add(v3(0, 1.0, 0))
      ;(this.auras[0].material as THREE.MeshBasicMaterial).opacity = 0.15 + prog * 0.25 + Math.sin(t * 30) * 0.05
    } else if (p.action === "punchL" || p.action === "punchR") {
      const el = t - p.actionStart
      const hold = 0.03
      const out =
        el < PUNCH_CONTACT ? ease(el / PUNCH_CONTACT) : el < PUNCH_CONTACT + hold ? 1 : 1 - ease((el - PUNCH_CONTACT - hold) / (PUNCH_TIME - PUNCH_CONTACT - hold))
      const side = p.action === "punchL" ? -1 : 1
      const slipped = t < o.dodgeUntil
      const aim = p.punchBlocked ? guardWorld.clone() : slipped ? headRest.clone() : headWorld.clone()
      const toward = this.player.root.position.clone().setY(aim.y).sub(aim).normalize()
      aim.addScaledVector(toward, p.punchBlocked ? this.player.gloveR * 1.8 : 0.125 + this.player.gloveR * 0.8)
      // Step into the punch so the glove can reach without stretching the arm.
      pp.lean.set(side * 0.04 * out, 0.22 * out)
      this.player.pose(pp)
      this.player.root.updateMatrixWorld(true)
      const local = this.player.root.worldToLocal(aim)
      const rest = side === -1 ? pp.handL : pp.handR
      const hand = rest.clone().lerp(local, out)
      if (side === -1) pp.handL = hand
      else pp.handR = hand
    } else if (p.action === "block" || t - p.guardFlash < 0.25) {
      pp.handL.set(-0.07, 1.62, 0.22)
      pp.handR.set(0.07, 1.62, 0.22)
    } else if (p.action === "hit") {
      const k = 1 - (t - p.actionStart) / 0.32
      pp.headOffset.set(0, 0.02 * k, -0.08 * k)
      pp.lean.set(0, -0.1 * k)
    } else if (p.action === "special") {
      const prog = (t - p.actionStart) / 1.1
      const out = prog < 0.4 ? ease(prog / 0.4) : prog < 0.6 ? 1 : 1 - ease((prog - 0.6) / 0.4)
      const wob = Math.sin(t * 40) * 0.05 * (prog < 0.4 ? 1 : 0)
      pp.lean.set(0, 0.25 * out)
      this.player.pose(pp)
      this.player.root.updateMatrixWorld(true)
      const local = this.player.root.worldToLocal(headWorld.clone())
      local.z -= 0.2
      pp.handL.lerp(local.clone().add(v3(-0.08 + wob, 0, 0)), out)
      pp.handR.lerp(local.clone().add(v3(0.08 - wob, 0, 0)), out)
      // Teleport: vanish in a puff, then appear for the blow.
      if (e.playerPower.kind === "teleport") {
        const el = t - p.actionStart
        this.player.root.visible = el < 0.12 || el > SPECIAL_CONTACT - 0.06
      }
    }
    if (!over && t - p.stepAt < 0.3) {
      const k = Math.sin(((t - p.stepAt) / 0.3) * Math.PI)
      pp.stride = k * p.stepDir
      pp.lean.x += p.stepDir * 0.08 * k
    } else if (fighting && pp.stride === undefined) pp.stride = Math.sin(beatPhase * Math.PI * 2 + 1) * 0.25
    if (t - p.hitFlash < 0.18 && p.action === "hit") {
      const k = 1 - (t - p.hitFlash) / 0.18
      pp.headOffset.x = p.hitSide * 0.06 * k
    }
    this.player.pose(pp)
    this.fall(this.player, playerFall)
    this.player.root.updateMatrixWorld(true)

    // --- frozen fighters sit in ice ---
    const frozen: [Avatar, boolean][] = [
      [this.player, t < p.frozenUntil],
      [this.opp, oppFrozen],
    ]
    frozen.forEach(([av, on], i) => {
      const block = this.iceBlocks[i]
      block.visible = on
      if (on) block.position.copy(av.root.position).add(v3(0, 1.0, 0))
    })

    this.poseReferee(t, beatPhase, center, dir, pPos, oPos)
    this.poseCoaches(t, dt, beatPhase, center)
    this.poseCrowd(t, beatPhase)
    this.poseElders(t, beatPhase)

    // --- effects ---
    for (const ev of e.fx) {
      if (this.seenFx.has(ev)) continue
      this.seenFx.add(ev)
      this.spawnFx(ev)
    }
    if (over && !this.confettiDone && (e.matchWon || e.mode === "watch") && t - (this.overAt ?? t) > 0.6) {
      this.confettiDone = true
      this.fx.confetti(center, t)
    }
    // Press photographers fire away during walk-outs, superpowers and knockouts.
    const busy = e.phase === "entrance" || over || (e.cine && e.cine.kind !== "combo")
    if (busy && t > this.nextFlash) {
      this.nextFlash = t + 0.08 + Math.random() * 0.25
      const c = this.crowd[Math.floor(Math.random() * this.crowd.length)]
      if (c) this.fx.cameraFlash(c.avatar.root.position.clone().add(v3(0, 1.6, 0)), t)
    }
    this.fx.update(t)

    const dizzy = o.state === "stagger" && !oppFrozen && !over
    this.stars.forEach((s, i) => {
      s.visible = dizzy
      if (!dizzy) return
      const ang2 = t * 5 + (i * Math.PI * 2) / 3
      s.position.set(headWorld.x + Math.cos(ang2) * 0.2, headWorld.y + 0.2, headWorld.z + Math.sin(ang2) * 0.2)
      s.rotation.y = t * 6
    })
    this.beatRing.position.set(oPos.x, R + 0.012, oPos.z)
    this.beatRing.scale.setScalar(1 + pulse * 0.4)
    ;(this.beatRing.material as THREE.MeshBasicMaterial).opacity = fighting ? 0.15 + pulse * 0.5 : 0
    this.bulbs.emissiveIntensity = 0.8 + pulse * 1.6
    this.updateBeams(t, beatPhase, pulse, center, pPos, oPos)

    // --- camera ---
    this.direct(t, dt, center, pPos, oPos)

    const head2d = this.toScreen(headWorld)
    this.oppHeadCache = { x: head2d.x, y: head2d.y, guardY: this.toScreen(guardWorld).y }
    const pHead = this.player.headWorld()
    const ph2d = this.toScreen(pHead)
    this.playerHeadCache = { x: ph2d.x, y: ph2d.y, guardY: ph2d.y + 10 }

    this.gl.render(this.scene, this.camera)
  }

  /** Before their walk-out starts, a fighter and their coach are still backstage. */
  private walkerVisible(i: 0 | 1, t: number) {
    const e = this.e
    const win = e.walk && (i === 0 ? e.walk.player : e.walk.opp)
    return e.phase !== "entrance" || !win || t >= win[0]
  }

  /** Puts both fighters on their marks: walking out, in the corner, nose to nose, on the stool, or wherever the fight takes them. */
  private placeFighters(t: number, dt: number, center: THREE.Vector3, dir: THREE.Vector3, pPos: THREE.Vector3, oPos: THREE.Vector3) {
    const e = this.e
    const k = 1 - Math.exp(-dt * 3.5)
    const out: [Stage | null, Stage | null] = [null, null]
    // A skipped walk-out puts everyone straight in their corners rather than sliding them through the ropes.
    if (this.lastPhase === "entrance" && e.phase !== "entrance" && e.walk) {
      for (const i of [0, 1] as const) {
        const pts = this.paths[i].pts
        this.shown[i].copy(pts[pts.length - 1])
        this.shown[i + 2].copy(CORNERS[i].apron)
      }
    }
    this.lastPhase = e.phase
    const fightPos = [pPos, oPos]
    const avatars = [this.player, this.opp]
    for (const i of [0, 1] as const) {
      const shown = this.shown[i]
      let face = fightPos[1 - i]
      const win = e.walk && (i === 0 ? e.walk.player : e.walk.opp)
      if (e.phase === "entrance" && win) {
        const prog = smooth((t - win[0]) / (win[1] - win[0]))
        const { pos, ahead } = pointAt(this.paths[i], prog * this.paths[i].total)
        shown.copy(pos)
        const walking = prog > 0 && prog < 1
        face = walking ? ahead : center
        out[i] = walking ? "walk" : "corner"
      } else if (e.phase === "fight" || e.phase === "over") {
        shown.copy(fightPos[i])
      } else {
        const target =
          e.phase === "faceoff" ? center.clone().addScaledVector(dir, i === 0 ? -0.36 : 0.36) : e.phase === "break" ? CORNERS[i].stool : fightPos[i]
        shown.lerp(target, k)
        const there = shown.distanceTo(target) < 0.12
        if (!there) out[i] = "corner"
        else if (e.phase === "faceoff") out[i] = "faceoff"
        else if (e.phase === "break") {
          out[i] = "seat"
          face = center
        }
      }
      const root = avatars[i].root
      root.position.copy(shown)
      if (Math.hypot(face.x - shown.x, face.z - shown.z) > 0.01) root.lookAt(face.x, shown.y, face.z)
    }
    this.opp.root.visible = this.walkerVisible(1, t)
    for (const st of this.stools) st.visible = e.phase === "break"
    return out
  }

  /** Body language outside the action. */
  private stagePose(p: Pose, stage: Stage, t: number, i: number) {
    const ph = t * 7 + i * 1.7
    if (stage === "walk") {
      const swing = Math.sin(ph)
      p.handL.set(-0.24, 1.0, 0.08 + swing * 0.12)
      p.handR.set(0.24, 1.0, 0.08 - swing * 0.12)
      p.stride = swing
      p.lean.set(0, 0.04)
      // A glove up to the crowd every few steps.
      if (Math.sin(t * 1.4 + i) > 0.55) p.handR.set(0.28, 1.95, 0.1)
    } else if (stage === "corner") {
      p.stride = Math.sin(ph) * 0.6
    } else if (stage === "faceoff") {
      // Nose to nose: gloves low, chin down, leaning in.
      p.handL.set(-0.2, 1.2, 0.22)
      p.handR.set(0.2, 1.2, 0.22)
      p.lean.set(0, 0.1)
      p.headOffset.set(0, -0.015, 0.04)
    } else {
      // On the stool, gloves on the knees, breathing hard.
      p.seat = 0.5
      p.handL.set(-0.16, 0.62, 0.36)
      p.handR.set(0.16, 0.62, 0.36)
      p.lean.set(0, 0.05 + Math.sin(t * 2.5) * 0.02)
    }
  }

  /** Each coach walks out behind their fighter, then works the corner from the apron. */
  private poseCoaches(t: number, dt: number, beatPhase: number, center: THREE.Vector3) {
    const e = this.e
    const k = 1 - Math.exp(-dt * 3)
    const beat = Math.abs(Math.sin(beatPhase * Math.PI))
    this.coaches.forEach((c, i) => {
      const shown = this.shown[i + 2]
      const corner = CORNERS[i]
      const fighter = i === 0 ? this.player : this.opp
      const win = e.walk && (i === 0 ? e.walk.player : e.walk.opp)
      const pose = Avatar.relaxed()
      let face = center.clone()
      let walking = false
      c.root.visible = this.walkerVisible(i as 0 | 1, t)
      const prog = win ? smooth((t - win[0]) / (win[1] - win[0])) : 1
      if (e.phase === "entrance" && win && prog < 1) {
        const path = this.paths[i]
        const { pos, ahead } = pointAt(path, prog * path.total - 0.9)
        shown.copy(pos)
        face = ahead
        walking = prog > 0
      } else {
        shown.lerp(corner.apron, k)
        walking = shown.distanceTo(corner.apron) > 0.1
      }
      const won = i === 0 ? e.matchWon : !e.matchWon
      if (walking) {
        const swing = Math.sin(t * 7 + i)
        pose.handL.z += swing * 0.12
        pose.handR.z -= swing * 0.12
        pose.stride = swing
      } else if (e.phase === "break") {
        // Leaning over the ropes into the corner, talking with their hands.
        face = fighter.root.position.clone()
        pose.lean.set(0, 0.22)
        pose.handL.set(-0.2, 1.15, 0.4)
        pose.handR.set(0.16, 1.3 + Math.sin(t * 8) * 0.1, 0.45)
        pose.headOffset.set(0, Math.sin(t * 9) * 0.01, 0.02)
      } else if (e.phase === "over") {
        if (won) this.celebrate(pose, t)
        else {
          pose.handL.set(-0.12, 1.75, 0.05)
          pose.handR.set(0.12, 1.75, 0.05)
        }
      } else if (e.phase === "fight" && (i === 0 ? e.player.combo >= 2 : e.opp.state === "strike" || e.opp.state === "windup")) {
        // Shouting their fighter on, fist pumping on the beat.
        pose.handL.set(-0.25, 1.15, 0.3)
        pose.handR.set(0.2, 1.45 + beat * 0.4, 0.25)
      } else {
        // Hands on the top rope.
        pose.handL.set(-0.3, 1.12, 0.32)
        pose.handR.set(0.3, 1.12, 0.32)
        pose.lean.set(0, 0.08)
      }
      c.root.position.copy(shown)
      if (Math.hypot(face.x - shown.x, face.z - shown.z) > 0.01) c.root.lookAt(face.x, shown.y, face.z)
      c.pose(pose)
    })
  }

  /** Arms up, on the toes: the winner's pose. */
  private celebrate(pose: Pose, t: number) {
    const k = Math.sin(t * 6) * 0.05
    pose.handL.set(-0.22, 1.95 + k, 0.1)
    pose.handR.set(0.22, 1.95 - k, 0.1)
    pose.headOffset.set(0, 0.02, -0.03)
  }

  private spawnFx(ev: FxEvent) {
    const e = this.e
    const attacker = ev.side === "player" ? this.player : this.opp
    const defender = ev.side === "player" ? this.opp : this.player
    const hand = () => attacker.handWorld(1)
    const body = () => attacker.root.position.clone()
    const target = () => defender.headWorld()
    if (ev.kind === "power" && ev.power) {
      const impact = ev.side === "player" ? ev.t + SPECIAL_CONTACT : e.opp.state === "windup" ? e.opp.stateEnd : ev.t + 0.1
      this.fx.power(ev.power.kind, ev.power.color, ev.power.glow, hand, body, target, ev.t, impact)
    } else if (ev.kind === "combo" && ev.combo) {
      const side = e.player.action === "punchL" ? 0 : 1
      this.fx.combo(ev.combo.color, () => attacker.handWorld(side), target, ev.t)
    } else if (ev.kind === "ko" || ev.kind === "finish") {
      for (let i = 0; i < 6; i++) {
        const c = this.crowd[Math.floor(Math.random() * this.crowd.length)]
        if (c) this.fx.cameraFlash(c.avatar.root.position.clone().add(v3(0, 1.6, 0)), ev.t + i * 0.05)
      }
    }
  }

  /** Concert beams sweep the ring, change colour on the beat, and pick out the fighters on the walk-out. */
  private updateBeams(t: number, beatPhase: number, pulse: number, center: THREE.Vector3, pPos: THREE.Vector3, oPos: THREE.Vector3) {
    const e = this.e
    const beatIndex = Math.floor(t / e.beatInterval)
    const walkout = e.phase === "entrance"
    this.beams.forEach((b, i) => {
      let target: THREE.Vector3
      if (walkout) target = this.shown[i % 2].clone()
      else if (e.cine?.kind === "ko" || e.phase === "over") target = (e.matchWon ? pPos : oPos).clone()
      else target = center.clone().add(v3(Math.sin(t * 0.7 + b.phase) * 1.8, 0, Math.cos(t * 0.55 + b.phase) * 1.6))
      const d = target.clone().sub(b.origin)
      const len = d.length()
      b.cone.position.copy(b.origin)
      b.cone.quaternion.setFromUnitVectors(v3(0, -1, 0), d.normalize())
      b.cone.scale.set(1, len, 1)
      const mat = b.cone.material as THREE.MeshBasicMaterial
      mat.color.set(BEAM_COLORS[(i + beatIndex) % BEAM_COLORS.length])
      mat.opacity = (walkout ? 0.16 : 0.07) + pulse * 0.06
      const light = this.beamLights[i === 0 ? 0 : i === 3 ? 1 : -1]
      if (light) {
        light.target.position.copy(target)
        light.color.copy(mat.color)
        light.intensity = 60 + pulse * 60
      }
    })
    void beatPhase
  }

  /** The camera director: walk-out crane shot, close-ups on superpowers, an orbit on knockouts. */
  private direct(t: number, dt: number, center: THREE.Vector3, pPos: THREE.Vector3, oPos: THREE.Vector3) {
    const e = this.e
    const back = this.portrait ? 1 : 0.85
    const offset = v3(-1.3 * back, 3.3 * back, 6.6 * back)
    let aim = center.clone().add(v3(0.1, 0.55, -0.1))
    let azimuth = -e.arena.angle
    let zoom = 1
    let lift = 0
    let speed = 4

    if (e.phase === "entrance" && e.walk) {
      // Tracking shot from in front of whoever is walking out.
      const oppTurn = t < e.walk.player[0]
      aim = this.shown[oppTurn ? 1 : 0].clone().add(v3(0, 0.95, 0))
      azimuth = oppTurn ? -0.75 : 0.75
      zoom = this.portrait ? 0.78 : 0.62
      lift = -1.1
      speed = 3
    } else if (e.phase === "entrance") {
      const k = ease((t - e.phaseStart) / Math.max(0.1, e.phaseEnd - e.phaseStart))
      azimuth += (1 - k) * 2.6
      zoom = 1.6 - 0.6 * k
      lift = (1 - k) * 2.5
      speed = 10
    } else if (e.phase === "faceoff") {
      // Tight on the stare-down, drifting slowly across it.
      const k = (t - e.phaseStart) / Math.max(0.1, e.phaseEnd - e.phaseStart)
      aim = center.clone().add(v3(0, 1.4, 0))
      azimuth += (k - 0.5) * 0.8
      zoom = this.portrait ? 0.56 : 0.36
      lift = -0.95
      speed = 3
    } else if (e.phase === "break") {
      // Into your corner, looking back at you on the stool with your coach behind.
      aim = this.shown[0].clone().add(v3(0, 0.8, 0))
      azimuth = 2.2
      zoom = 0.5
      lift = -0.8
      speed = 3
    } else if (e.cine && e.cine.kind === "power") {
      const who = e.cine.side === "player" ? pPos : oPos
      aim = who.clone().lerp(center, 0.6).add(v3(0, 0.8, 0))
      azimuth += e.cine.side === "player" ? 0.35 : -0.35
      zoom = 0.78
      lift = -0.5
      speed = 6
    } else if (e.cine && e.cine.kind === "combo") {
      zoom = 0.88
      speed = 8
    } else if (e.phase === "over") {
      const loser = e.matchKo ? (this.e.opp.hp <= 0 ? oPos : pPos) : e.matchWon ? pPos : oPos
      aim = loser.clone().add(v3(0, 0.6, 0))
      azimuth += (t - (this.overAt ?? t)) * 0.45
      zoom = e.matchKo ? 0.75 : 0.9
      lift = e.matchKo ? -0.5 : 0
      speed = 3
    }

    const desired = offset.multiplyScalar(zoom).add(v3(0, lift, 0)).applyAxisAngle(v3(0, 1, 0), azimuth).add(aim)
    const k = 1 - Math.exp(-dt * speed)
    if (this.lastT === t && dt === 0 && this.camPos.y === 6) this.camPos.copy(desired)
    this.camPos.lerp(desired, k)
    this.camAim.lerp(aim, k)
    const cam = this.camPos.clone()
    if (t < e.shake.until) {
      cam.x += (Math.random() - 0.5) * e.shake.power * 0.006
      cam.y += (Math.random() - 0.5) * e.shake.power * 0.006
    }
    this.camera.position.copy(cam)
    this.camera.lookAt(this.camAim)
    this.camera.updateMatrixWorld()
    this.fadeOccluders(cam, this.camAim)
  }

  /** Fades any truss pole standing in the camera's line of sight, so it never hides the fighters. */
  private fadeOccluders(cam: THREE.Vector3, aim: THREE.Vector3) {
    const view = aim.clone().sub(cam).setY(0)
    const len = view.length()
    view.normalize()
    for (const pole of this.poles) {
      const rel = pole.position.clone().sub(cam).setY(0)
      const along = rel.dot(view)
      const off = rel.addScaledVector(view, -along).length()
      const blocking = along > 0 && along < len + 0.3 && off < 0.9
      const mat = pole.material as THREE.MeshStandardMaterial
      const target = blocking ? 0.12 : 1
      mat.opacity += (target - mat.opacity) * 0.2
      mat.transparent = mat.opacity < 0.99
      mat.depthWrite = !mat.transparent
    }
  }

  /** Tips a knocked-out fighter onto their back. */
  private fall(a: Avatar, k: number) {
    const f = ease(k)
    a.body.rotation.x = -f * 1.4
    a.body.position.y = 0.1 * f
  }

  private poseElders(t: number, beatPhase: number) {
    const e = this.e
    const excited = e.phase === "over" || e.cine?.kind === "power" || e.cine?.kind === "ko"
    for (const el of this.elders) {
      const p = Avatar.relaxed()
      p.seat = 0.5
      if (excited) {
        const open = Math.sin(t * 12 + el.phase * 6) * 0.05
        p.handL.set(-0.04 - open, 1.05, 0.35)
        p.handR.set(0.04 + open, 1.05, 0.35)
      } else {
        // Hands resting on the knees, nodding along to the beat.
        p.handL.set(-0.14, 0.6, 0.38)
        p.handR.set(0.14, 0.6, 0.38)
        p.headOffset.set(0, -Math.abs(Math.sin((beatPhase + el.phase) * Math.PI)) * 0.012, 0)
      }
      el.avatar.pose(p)
    }
  }

  private poseReferee(t: number, beatPhase: number, center: THREE.Vector3, dir: THREE.Vector3, pPos: THREE.Vector3, oPos: THREE.Vector3) {
    const e = this.e
    const ref = this.ref
    const pose = Avatar.guard()
    pose.handL.set(-0.25, 0.95, 0.12)
    pose.handR.set(0.25, 0.95, 0.12)
    // Stand off to the far side of the fighters, out of the camera's way.
    const away = v3(-dir.z, 0, dir.x)
    const toCam = this.camPos.clone().sub(center).setY(0).normalize()
    if (away.dot(toCam) > 0) away.negate()
    let target = center.clone().addScaledVector(away, 1.15).addScaledVector(dir, Math.sin(t * 0.6) * 0.3)
    let lookAt = center.clone()

    if (e.phase === "entrance") {
      target = center.clone().addScaledVector(away, 0.9)
    } else if (e.phase === "faceoff") {
      // Between them, hands out, giving the instructions.
      target = center.clone().addScaledVector(away, 0.55)
      pose.handL.set(-0.38, 1.35, 0.3)
      pose.handR.set(0.38, 1.35 + Math.sin(t * 5) * 0.05, 0.3)
    } else if (e.phase === "intro") {
      // Calls the fighters together, then chops the air to start the round.
      target = center.clone().addScaledVector(away, 0.7)
      const left = e.phaseEnd - t
      if (left > 0.7) pose.handR.set(0.15, 1.95, 0.2)
      else pose.handR.set(0.1, 1.1 + ease(left / 0.7) * 0.8, 0.45)
    } else if (e.phase === "break") {
      target = center.clone().addScaledVector(away, 1.4)
      pose.handL.set(-0.2, 1.3, 0.25)
      pose.handR.set(0.2, 1.3, 0.25)
    } else if (e.phase === "over") {
      const winnerPos = e.matchWon ? pPos : oPos
      const loserPos = e.matchWon ? oPos : pPos
      if (e.matchKo) {
        // The count over the fallen fighter, then waving it off.
        target = loserPos.clone().addScaledVector(away, 0.6)
        lookAt = loserPos.clone()
        const counting = t - (this.overAt ?? t) < 2
        if (counting) pose.handR.set(0.15, 1.2 + Math.abs(Math.sin(beatPhase * Math.PI)) * 0.5, 0.35)
        else {
          const wave = Math.sin(t * 9) * 0.25
          pose.handL.set(-0.1 + wave, 1.85, 0.15)
          pose.handR.set(0.1 - wave, 1.85, 0.15)
        }
      } else {
        // Raises the winner's hand.
        target = center.clone().addScaledVector(away, 0.35)
        lookAt = winnerPos.clone()
        pose.handR.set(0.3, 1.95, 0)
      }
    } else if (e.opp.state === "stagger") {
      target = center.clone().addScaledVector(away, 0.85)
      pose.lean.set(0, 0.12)
      pose.handR.set(0.15, 1.35, 0.4)
    } else {
      pose.crouch = Math.abs(Math.sin(beatPhase * Math.PI)) * 0.03
    }

    target.y = R
    ref.root.position.lerp(target, 0.06)
    ref.root.lookAt(lookAt.x, R, lookAt.z)
    ref.pose(pose)
  }

  dispose() {
    this.fx.dispose()
    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
        mat.dispose()
      }
    })
    ;(this.scene.background as THREE.Texture | null)?.dispose()
    this.gl.dispose()
    this.el.remove()
  }
}

function pick2(color: string) {
  return color === "#f5c400" ? "#ff4d3d" : "#f5c400"
}
