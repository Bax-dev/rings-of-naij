import type { Genre } from "./fighters"

/** 8 steps per bar (eighth notes). 1 = hit, 0 = rest. */
interface Pattern {
  kick: number[]
  snare: number[]
  hat: number[]
  perc: number[]
  bass: number[]
  percKind: "shaker" | "talkingdrum" | "logdrum" | "clave"
}

const PATTERNS: Record<Genre, Pattern> = {
  afrobeats: {
    kick: [1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1],
    perc: [0, 1, 0, 0, 1, 0, 0, 1],
    bass: [55, 0, 0, 55, 0, 65.4, 0, 0],
    percKind: "shaker",
  },
  streethop: {
    kick: [1, 0, 0, 0, 1, 1, 0, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat: [1, 0, 1, 1, 1, 0, 1, 1],
    perc: [0, 0, 0, 1, 0, 0, 0, 0],
    bass: [49, 0, 0, 0, 49, 58.3, 0, 0],
    percKind: "clave",
  },
  fuji: {
    kick: [1, 0, 1, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 0, 0, 1, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1],
    perc: [1, 0, 1, 1, 0, 1, 1, 0],
    bass: [0, 0, 0, 0, 0, 0, 0, 0],
    percKind: "talkingdrum",
  },
  amapiano: {
    kick: [1, 0, 1, 0, 1, 0, 1, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1],
    perc: [0, 0, 0, 1, 0, 1, 0, 1],
    bass: [0, 0, 0, 0, 0, 0, 0, 0],
    percKind: "logdrum",
  },
  highlife: {
    kick: [1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1],
    perc: [1, 0, 0, 1, 0, 0, 1, 0],
    bass: [65.4, 0, 82.4, 0, 73.4, 0, 98, 0],
    percKind: "clave",
  },
}

export type Sfx = "hit" | "hitBig" | "blocked" | "whoosh" | "hurt" | "special" | "bell" | "cheer" | "dodge"

/**
 * Every sound in the game is made here with the Web Audio API (no audio files, no copyrighted music).
 * The AudioContext is only created inside a user gesture, so sound never starts before the first tap.
 */
export class AudioEngine {
  ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  muted = false

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.55
    this.master.connect(this.ctx.destination)
    const len = this.ctx.sampleRate
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running"
  }

  get now() {
    return this.ctx?.currentTime ?? 0
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.02)
  }

  suspend() {
    if (this.ctx?.state === "running") void this.ctx.suspend()
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume()
  }

  /** Schedules one eighth-note step of the genre's beat at audio time `when`. */
  playStep(genre: Genre, step: number, when: number) {
    if (!this.ready) return
    const p = PATTERNS[genre]
    const i = step % 8
    if (p.kick[i]) this.kick(when)
    if (p.snare[i]) this.snare(when)
    if (p.hat[i]) this.hat(when, i % 2 === 0 ? 0.09 : 0.05)
    if (p.perc[i]) this.perc(p.percKind, when, step)
    if (p.bass[i]) this.bass(p.bass[i], when)
  }

  sfx(kind: Sfx) {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime + 0.005
    switch (kind) {
      case "hit":
        this.noiseHit(t, 0.08, 900, 0.5)
        this.tone(t, 140, 60, 0.09, 0.5, "sine")
        break
      case "hitBig":
        this.noiseHit(t, 0.14, 1400, 0.7)
        this.tone(t, 180, 50, 0.16, 0.7, "sine")
        break
      case "blocked":
        this.noiseHit(t, 0.05, 3000, 0.25)
        break
      case "whoosh":
        this.noiseHit(t, 0.12, 2200, 0.12, "bandpass")
        break
      case "dodge":
        this.noiseHit(t, 0.16, 1600, 0.18, "bandpass")
        this.tone(t, 600, 900, 0.1, 0.08, "triangle")
        break
      case "hurt":
        this.noiseHit(t, 0.12, 600, 0.6)
        this.tone(t, 110, 40, 0.18, 0.6, "sine")
        break
      case "special":
        this.tone(t, 220, 880, 0.35, 0.3, "sawtooth")
        this.noiseHit(t + 0.3, 0.3, 1200, 0.8)
        this.tone(t + 0.3, 90, 35, 0.4, 0.8, "sine")
        break
      case "bell":
        for (let k = 0; k < 2; k++) {
          this.tone(t + k * 0.18, 1320, 1320, 0.6, 0.18, "sine")
          this.tone(t + k * 0.18, 1980, 1980, 0.4, 0.08, "sine")
        }
        break
      case "cheer":
        this.noiseHit(t, 1.2, 1200, 0.22, "bandpass", 0.4)
        break
    }
  }

  /** The talking-drum entrance theme (product entrance_talkingdrum). */
  talkingDrumIntro() {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime + 0.05
    const hits: [number, number, number][] = [
      [0, 180, 260],
      [0.22, 260, 160],
      [0.44, 200, 300],
      [0.66, 300, 180],
      [0.99, 180, 120],
      [1.21, 240, 340],
      [1.43, 340, 200],
    ]
    for (const [dt, f0, f1] of hits) this.tone(t + dt, f0, f1, 0.22, 0.5, "sine")
  }

  private kick(t: number) {
    this.tone(t, 150, 45, 0.18, 0.9, "sine")
  }

  private snare(t: number) {
    this.noiseHit(t, 0.12, 1800, 0.35)
    this.tone(t, 220, 160, 0.06, 0.2, "triangle")
  }

  private hat(t: number, vol: number) {
    this.noiseHit(t, 0.04, 8000, vol, "highpass")
  }

  private bass(freq: number, t: number) {
    this.tone(t, freq, freq, 0.22, 0.35, "triangle")
  }

  private perc(kind: Pattern["percKind"], t: number, step: number) {
    switch (kind) {
      case "shaker":
        this.noiseHit(t, 0.05, 6000, 0.12, "bandpass")
        break
      case "clave":
        this.tone(t, 2400, 2400, 0.04, 0.14, "sine")
        break
      case "talkingdrum": {
        const up = step % 3 === 0
        this.tone(t, up ? 170 : 260, up ? 270 : 160, 0.16, 0.45, "sine")
        break
      }
      case "logdrum": {
        const f = [55, 55, 65.4, 49][step % 4]
        this.tone(t, f * 2, f, 0.3, 0.6, "sine")
        break
      }
    }
  }

  private tone(t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noiseHit(t: number, dur: number, freq: number, vol: number, type: BiquadFilterType = "lowpass", attack = 0) {
    if (!this.ctx || !this.master || !this.noise) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    const g = this.ctx.createGain()
    if (attack > 0) {
      g.gain.setValueAtTime(0.001, t)
      g.gain.exponentialRampToValueAtTime(vol, t + attack)
    } else {
      g.gain.setValueAtTime(vol, t)
    }
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.02)
  }
}

export const audio = new AudioEngine()
