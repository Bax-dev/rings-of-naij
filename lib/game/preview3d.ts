import * as THREE from "three"
import { Avatar, type Look } from "./avatar3d"

/** A small turntable that shows one fighter, for the customisation studio. Drag to spin. */
export class AvatarPreview {
  private gl: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  private avatar: Avatar | null = null
  private raf = 0
  private spin = 0.5
  private drag: { x: number; spin: number } | null = null
  private lastInput = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.scene.add(new THREE.HemisphereLight("#ffe6c8", "#2a1d3a", 1.6))
    const key = new THREE.DirectionalLight("#ffffff", 2.2)
    key.position.set(2, 4, 3)
    const rim = new THREE.DirectionalLight("#f5c400", 1.6)
    rim.position.set(-3, 2, -3)
    this.scene.add(key, rim)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: "#3b3a72", roughness: 0.9 }))
    floor.rotation.x = -Math.PI / 2
    this.scene.add(floor)
    this.camera.position.set(0, 1.35, 4.2)
    this.camera.lookAt(0, 1.05, 0)
    canvas.addEventListener("pointerdown", this.down)
    window.addEventListener("pointermove", this.move)
    window.addEventListener("pointerup", this.up)
    this.resize()
    this.loop()
  }

  setLook(look: Look, seed: number, belt?: { plate: string; strap: string } | null) {
    if (this.avatar) {
      this.scene.remove(this.avatar.root)
      disposeTree(this.avatar.root)
    }
    const a = new Avatar({ ...look, lite: false }, seed)
    if (belt) a.wearBelt(belt.plate, belt.strap)
    this.scene.add(a.root)
    this.avatar = a
  }

  resize() {
    const r = this.canvas.getBoundingClientRect()
    const w = Math.max(1, r.width)
    const h = Math.max(1, r.height)
    this.gl.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loop = () => {
    const t = performance.now() / 1000
    if (!this.drag && t - this.lastInput > 2) this.spin += 0.006
    if (this.avatar) {
      this.avatar.root.rotation.y = this.spin
      const pose = Avatar.guard()
      const bob = Math.sin(t * 3) * 0.02
      pose.handL.y += bob
      pose.handR.y -= bob
      pose.stride = Math.sin(t * 3) * 0.2
      this.avatar.pose(pose)
    }
    this.gl.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.loop)
  }

  private down = (e: PointerEvent) => {
    this.drag = { x: e.clientX, spin: this.spin }
  }

  private move = (e: PointerEvent) => {
    if (!this.drag) return
    this.spin = this.drag.spin + (e.clientX - this.drag.x) * 0.012
    this.lastInput = performance.now() / 1000
  }

  private up = () => {
    this.drag = null
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener("pointerdown", this.down)
    window.removeEventListener("pointermove", this.move)
    window.removeEventListener("pointerup", this.up)
    disposeTree(this.scene)
    this.gl.dispose()
  }
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh
    if (m.geometry && m.geometry.type !== "SphereGeometry") m.geometry.dispose()
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
      mat.dispose()
    }
  })
}
