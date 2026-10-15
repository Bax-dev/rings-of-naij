import * as THREE from "three"
import type { PowerKind } from "./powers"

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

type Getter = () => THREE.Vector3

interface Effect {
  start: number
  end: number
  objs: THREE.Object3D[]
  /** Returns false once the effect is done. */
  tick: (t: number) => void
}

function glowMat(color: string, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
}

/**
 * Plays the short-lived 3D effects: superpowers, combo trails, knockout bursts, confetti and
 * camera flashes. Geometry is shared; each effect owns only its materials.
 */
export class FxManager {
  private effects: Effect[] = []
  private sphere = new THREE.SphereGeometry(1, 16, 12)
  private ring = new THREE.TorusGeometry(1, 0.06, 8, 40)
  private flatRing = new THREE.RingGeometry(0.85, 1, 48)
  private box = new THREE.BoxGeometry(1, 1, 1)
  private octa = new THREE.OctahedronGeometry(1)
  private plane = new THREE.PlaneGeometry(1, 1)
  private flash: THREE.PointLight
  private flashUntil = 0

  constructor(private scene: THREE.Scene) {
    this.flash = new THREE.PointLight("#ffffff", 0, 12, 1.5)
    scene.add(this.flash)
  }

  private add(start: number, dur: number, objs: THREE.Object3D[], tick: (t: number) => void) {
    for (const o of objs) {
      o.visible = false
      this.scene.add(o)
    }
    this.effects.push({ start, end: start + dur, objs, tick })
  }

  private light(pos: THREE.Vector3, color: string, t: number, power = 60) {
    this.flash.position.copy(pos)
    this.flash.color.set(color)
    this.flash.intensity = power
    this.flashUntil = t + 0.25
  }

  /**
   * A superpower from one fighter to the other. `hand` and `target` are read every frame so the
   * effect follows the fighters as they move. The blow lands at `impact`.
   */
  power(kind: PowerKind, color: string, glow: string, hand: Getter, body: Getter, target: Getter, start: number, impact: number) {
    const travel = Math.min(0.35, Math.max(0.12, impact - start - 0.05))
    const launch = impact - travel
    const after = 0.6
    const objs: THREE.Object3D[] = []
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo, mat)
      objs.push(m)
      return m
    }
    // Charge-up glow at the attacker's hands, common to every power.
    const charge = mk(this.sphere, glowMat(glow, 0.7))
    let impacted = false
    const onImpact = (t: number, pos: THREE.Vector3) => {
      if (impacted) return
      impacted = true
      this.light(pos, color, t, kind === "lightning" ? 140 : 70)
    }

    if (kind === "fire" || kind === "ice" || kind === "spirit") {
      const core = mk(this.sphere, glowMat(kind === "fire" ? "#fff2c0" : glow, 1))
      const outer = mk(this.sphere, glowMat(color, 0.55))
      const trail = [0, 1, 2, 3].map(() => mk(this.sphere, glowMat(color, 0.35)))
      const burst = mk(this.sphere, glowMat(color, 0.6))
      const bits = Array.from({ length: kind === "ice" ? 8 : 14 }, () => mk(kind === "ice" ? this.octa : this.box, glowMat(kind === "ice" ? "#e8fdff" : glow, 0.9)))
      const dirs = bits.map(() => v3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize())
      // The spirit power raises a ghostly ancestor over the attacker first.
      const ghost = kind === "spirit" ? mk(new THREE.CapsuleGeometry(0.35, 1.2, 6, 12), glowMat(color, 0.25)) : null
      this.add(start, impact - start + after, objs, (t) => {
        const from = hand()
        const to = target()
        const ck = clamp01((t - start) / Math.max(0.01, launch - start))
        charge.visible = t < launch + 0.05
        charge.position.copy(from)
        charge.scale.setScalar(0.08 + ck * 0.14 + Math.sin(t * 40) * 0.01)
        if (ghost) {
          ghost.visible = t < impact + 0.2
          ghost.position.copy(body()).add(v3(0, 1.0 + ck * 0.4, 0))
          ghost.scale.setScalar(0.6 + ck * 0.5)
          ;(ghost.material as THREE.MeshBasicMaterial).opacity = 0.25 * (1 - clamp01((t - impact) / 0.2))
        }
        const k = clamp01((t - launch) / travel)
        const flying = t >= launch && t < impact
        const pos = from.clone().lerp(to, k)
        pos.y += Math.sin(k * Math.PI) * 0.15
        core.visible = outer.visible = flying
        core.position.copy(pos)
        outer.position.copy(pos)
        core.scale.setScalar(0.07)
        outer.scale.setScalar(0.14 + Math.sin(t * 50) * 0.02)
        trail.forEach((s, i) => {
          s.visible = flying
          s.position.copy(from.clone().lerp(to, Math.max(0, k - (i + 1) * 0.08)))
          s.scale.setScalar(0.1 - i * 0.02)
        })
        const bk = clamp01((t - impact) / after)
        burst.visible = t >= impact && bk < 1
        if (t >= impact) onImpact(t, to)
        burst.position.copy(to)
        burst.scale.setScalar(0.1 + bk * 0.7)
        ;(burst.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - bk)
        bits.forEach((b, i) => {
          b.visible = t >= impact && bk < 1
          b.position.copy(to).addScaledVector(dirs[i], bk * 0.9)
          b.position.y -= bk * bk * 0.4
          b.scale.setScalar(0.03 * (1 - bk) + 0.005)
          b.rotation.set(t * 8 + i, t * 6, 0)
        })
      })
    } else if (kind === "lightning") {
      const segs = 12
      const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: segs + 1 }, () => v3()))
      const bolt = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending }))
      const bolt2 = new THREE.Line(geo.clone(), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }))
      objs.push(bolt, bolt2)
      const glowBall = mk(this.sphere, glowMat(color, 0.6))
      this.add(start, impact - start + after, objs, (t) => {
        const from = hand()
        const to = target()
        charge.visible = t < impact
        charge.position.copy(from)
        charge.scale.setScalar(0.1 + Math.random() * 0.06)
        const on = t >= launch && t < impact + 0.3
        bolt.visible = bolt2.visible = on
        glowBall.visible = t >= impact && t < impact + 0.3
        glowBall.position.copy(to)
        glowBall.scale.setScalar(0.25 + Math.random() * 0.1)
        if (on) {
          // Strike from the sky, jagged and re-rolled every frame.
          const sky = to.clone().add(v3(0, 5, 0))
          const src = t < impact ? from : sky
          for (const line of [bolt, bolt2]) {
            const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute
            for (let i = 0; i <= segs; i++) {
              const p = src.clone().lerp(to, i / segs)
              if (i > 0 && i < segs) p.add(v3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25))
              attr.setXYZ(i, p.x, p.y, p.z)
            }
            attr.needsUpdate = true
          }
        }
        if (t >= impact) onImpact(t, to)
      })
    } else if (kind === "quake" || kind === "sound") {
      const waves = [0, 1, 2].map(() => mk(kind === "quake" ? this.flatRing : this.ring, glowMat(kind === "quake" ? color : glow, 0.7)))
      const rocks = kind === "quake" ? Array.from({ length: 10 }, () => mk(this.box, new THREE.MeshStandardMaterial({ color: "#6b4a2c", roughness: 1 }))) : []
      const dirs = rocks.map(() => v3(Math.random() - 0.5, 1 + Math.random(), Math.random() - 0.5))
      this.add(start, impact - start + after, objs, (t) => {
        const from = kind === "quake" ? body() : hand()
        const to = target()
        charge.visible = t < launch
        charge.position.copy(hand())
        charge.scale.setScalar(0.12 + Math.sin(t * 30) * 0.03)
        waves.forEach((w, i) => {
          const k = clamp01((t - launch - i * 0.08) / (travel + 0.2))
          w.visible = k > 0 && k < 1
          ;(w.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k)
          if (kind === "quake") {
            w.position.copy(from).setY(from.y + 0.02)
            w.rotation.set(-Math.PI / 2, 0, 0)
            w.scale.setScalar(0.2 + k * 2.2)
          } else {
            const p = from.clone().lerp(to, k)
            w.position.copy(p)
            w.lookAt(to)
            w.scale.setScalar(0.08 + k * 0.35)
          }
        })
        const bk = clamp01((t - impact) / after)
        rocks.forEach((r, i) => {
          r.visible = t >= impact && bk < 1
          r.position.copy(to).setY(to.y - 1.2).addScaledVector(dirs[i], bk * 0.9)
          r.position.y -= bk * bk * 1.2
          r.scale.setScalar(0.07)
          r.rotation.set(t * 5 + i, t * 3, 0)
        })
        if (t >= impact) onImpact(t, to)
      })
    } else if (kind === "chain") {
      const links = Array.from({ length: 14 }, () => mk(this.ring, new THREE.MeshStandardMaterial({ color: "#d8d6d0", metalness: 0.9, roughness: 0.3 })))
      const tip = mk(new THREE.ConeGeometry(0.05, 0.16, 8), new THREE.MeshStandardMaterial({ color: "#f5c400", metalness: 0.9, roughness: 0.2 }))
      this.add(start, impact - start + after, objs, (t) => {
        const from = hand()
        const to = target()
        charge.visible = t < launch
        charge.position.copy(from)
        charge.scale.setScalar(0.08)
        // Out to the target, then reel back in with them.
        const out = t < impact ? clamp01((t - launch) / travel) : 1 - clamp01((t - impact) / (after * 0.8))
        const end = from.clone().lerp(to, out)
        links.forEach((l, i) => {
          const k = (i + 1) / links.length
          l.visible = out > 0 && k <= 1
          l.position.copy(from.clone().lerp(end, k))
          l.scale.setScalar(0.03)
          l.lookAt(end)
          l.rotateY(i % 2 ? Math.PI / 2 : 0)
        })
        tip.visible = out > 0
        tip.position.copy(end)
        tip.lookAt(to)
        tip.rotateX(Math.PI / 2)
        if (t >= impact) onImpact(t, to)
      })
    } else {
      // Teleport: purple smoke where the attacker vanishes and where they land the blow.
      const puffs = Array.from({ length: 10 }, () => mk(this.sphere, glowMat(color, 0.4)))
      const offs = puffs.map(() => v3(Math.random() - 0.5, Math.random() * 1.4, Math.random() - 0.5))
      let vanishAt: THREE.Vector3 | null = null
      this.add(start, impact - start + after, objs, (t) => {
        const to = target()
        if (!vanishAt) vanishAt = body().clone()
        charge.visible = false
        puffs.forEach((p, i) => {
          const first = i < 5
          const t0 = first ? start + 0.05 : impact - 0.05
          const k = clamp01((t - t0) / 0.45)
          p.visible = k > 0 && k < 1
          p.position.copy(first ? vanishAt! : to).add(offs[i].clone().multiplyScalar(0.5 + k * 0.6))
          if (!first) p.position.y -= 1.2
          p.scale.setScalar(0.12 + k * 0.25)
          ;(p.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k)
        })
        if (t >= impact) onImpact(t, to)
      })
    }
  }

  /** A bright trail on the glove that finished a combo, and a ring at the point of impact. */
  combo(color: string, hand: Getter, target: Getter, start: number) {
    const trail = Array.from({ length: 6 }, () => new THREE.Mesh(this.sphere, glowMat(color, 0.5)))
    const ring = new THREE.Mesh(this.ring, glowMat(color, 0.9))
    const history: THREE.Vector3[] = []
    this.add(start, 0.6, [...trail, ring], (t) => {
      history.unshift(hand().clone())
      if (history.length > trail.length) history.pop()
      trail.forEach((s, i) => {
        s.visible = !!history[i] && t < start + 0.4
        if (history[i]) s.position.copy(history[i])
        s.scale.setScalar(0.09 - i * 0.012)
      })
      const k = clamp01((t - start - 0.08) / 0.4)
      ring.visible = k > 0 && k < 1
      ring.position.copy(target())
      ring.scale.setScalar(0.1 + k * 0.5)
      ring.lookAt(this.scene.position)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k)
    })
  }

  /** Confetti over the ring for the winner. */
  confetti(center: THREE.Vector3, start: number) {
    const colors = ["#f5c400", "#1fb86a", "#ffffff", "#ff4d3d", "#3a86ff", "#e0457b"]
    const bits = Array.from({ length: 70 }, (_, i) => {
      const m = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }))
      m.scale.set(0.06, 0.03, 1)
      return m
    })
    const seeds = bits.map(() => ({ x: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4, h: 4 + Math.random() * 3, spin: Math.random() * 10, delay: Math.random() * 0.8 }))
    this.add(start, 4.5, bits, (t) => {
      bits.forEach((b, i) => {
        const s = seeds[i]
        const k = t - start - s.delay
        b.visible = k > 0
        b.position.set(center.x + s.x + Math.sin(k * 2 + s.spin) * 0.3, center.y + s.h - k * 1.2, center.z + s.z)
        b.rotation.set(k * s.spin, k * 3, 0)
      })
    })
  }

  /** Press photographers in the crowd: little white flashes. */
  cameraFlash(pos: THREE.Vector3, t: number) {
    const m = new THREE.Mesh(this.sphere, glowMat("#ffffff", 1))
    this.add(t, 0.12, [m], (now) => {
      const k = clamp01((now - t) / 0.12)
      m.position.copy(pos)
      m.scale.setScalar(0.035 + k * 0.05)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 1 - k
    })
  }

  update(t: number) {
    this.flash.intensity = t < this.flashUntil ? this.flash.intensity * 0.85 : 0
    const live: Effect[] = []
    for (const fx of this.effects) {
      if (t >= fx.end) {
        for (const o of fx.objs) {
          this.scene.remove(o)
          const m = o as THREE.Mesh
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
          for (const mat of mats) mat.dispose()
          if (o instanceof THREE.Line) o.geometry.dispose()
        }
        continue
      }
      if (t >= fx.start) {
        for (const o of fx.objs) o.visible = true
        fx.tick(t)
      }
      live.push(fx)
    }
    this.effects = live
  }

  dispose() {
    this.update(Number.POSITIVE_INFINITY)
    for (const g of [this.sphere, this.ring, this.flatRing, this.box, this.octa, this.plane]) g.dispose()
    this.scene.remove(this.flash)
  }
}
