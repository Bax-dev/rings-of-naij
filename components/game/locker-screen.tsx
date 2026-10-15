"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Check, ClipboardList, Lock, Music, Palette, MapPin, ShoppingBag, Users } from "lucide-react"
import { FEMALE_FIGHTERS, boxerLook, hashString, std } from "@/lib/game/avatar3d"
import { bestBelt } from "@/lib/game/belts"
import { COACHES, coachById, gamePlan, isCoachUnlocked } from "@/lib/game/coaches"
import { applyCustom, type Custom } from "@/lib/game/customize"
import type { Cosmetics } from "@/lib/game/engine"
import type { FighterDef, OpponentDef } from "@/lib/game/fighters"
import { AvatarPreview } from "@/lib/game/preview3d"
import { cn } from "@/lib/utils"
import { ScreenShell } from "./screen-shell"

const GEAR: { key: keyof Cosmetics; label: string }[] = [
  { key: "goldGloves", label: "Gold gloves" },
  { key: "ankaraTrunks", label: "Ankara trunks" },
  { key: "talkingDrumEntrance", label: "Talking-drum walk-out" },
]

/** Before every career and daily fight: pick your coach, read the scouting report, then walk out. */
export function LockerScreen({
  fighter,
  opponent,
  subtitle,
  careerStage,
  coachId,
  perksOn,
  cosmetics,
  custom,
  belts,
  onCoach,
  onWalkOut,
  onBack,
  onChangeFighter,
  onStudio,
  onShop,
}: {
  fighter: FighterDef
  opponent: OpponentDef
  subtitle: string
  careerStage: number
  coachId: string
  perksOn: boolean
  cosmetics: Cosmetics
  custom: Custom | undefined
  belts: string[]
  onCoach: (id: string) => void
  onWalkOut: () => void
  onBack: () => void
  onChangeFighter: () => void
  onStudio: () => void
  onShop: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<AvatarPreview | null>(null)
  const [failed, setFailed] = useState(false)
  const coach = coachById(coachId)
  const plan = useMemo(() => gamePlan(opponent), [opponent])
  const belt = bestBelt(belts)
  const look = useMemo(
    () =>
      applyCustom(
        boxerLook(fighter.id, fighter.colors, {
          female: FEMALE_FIGHTERS.has(fighter.id),
          gloves: cosmetics.goldGloves ? std("#f5c400", { metalness: 0.85, roughness: 0.25 }) : std(fighter.colors.gloves, { roughness: 0.35 }),
          bulk: 0.92 + fighter.power * 0.1,
        }),
        custom,
      ),
    [fighter, custom, cosmetics.goldGloves],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let p: AvatarPreview
    try {
      p = new AvatarPreview(canvas)
    } catch {
      setFailed(true)
      return
    }
    previewRef.current = p
    const ro = new ResizeObserver(() => p.resize())
    ro.observe(canvas)
    return () => {
      ro.disconnect()
      p.dispose()
      previewRef.current = null
    }
  }, [])

  useEffect(() => {
    previewRef.current?.setLook(look, hashString(fighter.id), belt)
  }, [look, fighter.id, belt, failed])

  const threat = Math.round(opponent.difficulty * 5)

  return (
    <ScreenShell
      title="Locker room"
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={onWalkOut}
          className="w-full rounded-2xl bg-primary py-4 font-display text-2xl uppercase text-primary-foreground shadow-[0_6px_0_#a07f00] active:translate-y-1 active:shadow-[0_2px_0_#a07f00]"
        >
          Walk out
        </button>
      }
    >
      <p className="-mt-1 mb-3 text-xs uppercase tracking-widest text-muted-foreground">{subtitle}</p>

      <div className="relative mb-4 h-[34dvh] min-h-52 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_70%,#3b3a72,#14101f_70%)] ring-1 ring-border">
        {failed ? (
          <Image src={fighter.portrait || "/placeholder.svg"} alt="" fill className="object-cover object-top" />
        ) : (
          <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" aria-label={`${fighter.name}, drag to turn`} />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-background/90 to-transparent p-3 pt-10">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{fighter.style}</p>
            <p className="truncate font-display text-2xl uppercase leading-none">{fighter.name}</p>
          </div>
          <div className="pointer-events-auto flex shrink-0 gap-2">
            <button type="button" onClick={onChangeFighter} className="flex size-11 items-center justify-center rounded-full bg-secondary active:scale-95" aria-label="Change fighter">
              <Users className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={onStudio} className="flex size-11 items-center justify-center rounded-full bg-secondary active:scale-95" aria-label="Open the studio">
              <Palette className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <section className="mb-4 overflow-hidden rounded-2xl bg-card ring-1 ring-border" aria-labelledby="scout">
        <div className="h-1.5" style={{ backgroundColor: opponent.colors.gloves }} />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Tonight&apos;s opponent</p>
              <h2 id="scout" className="font-display text-3xl uppercase leading-none text-primary">
                {opponent.name}
              </h2>
              <p className="text-sm text-muted-foreground">{opponent.title}</p>
            </div>
            <div className="shrink-0 text-right" aria-label={`Threat ${threat} of 5`}>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Threat</p>
              <div className="mt-1 flex gap-0.5" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={cn("h-3 w-2 rounded-sm", n <= Math.max(1, threat) ? "bg-accent" : "bg-secondary")} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
              <MapPin className="size-3.5" aria-hidden /> {opponent.venue}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
              <Music className="size-3.5" aria-hidden /> {opponent.bpm} BPM
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1">{opponent.hp} HP</span>
          </div>
          <div className="rounded-xl bg-secondary/60 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 font-display text-sm uppercase text-primary">
              <ClipboardList className="size-4" aria-hidden /> {coach.name}&apos;s game plan
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {plan.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-4" aria-labelledby="coach-h">
        <h2 id="coach-h" className="mb-2 font-display text-xl uppercase">
          Your coach
        </h2>
        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="coach-h">
          {COACHES.map((c) => {
            const open = isCoachUnlocked(c, careerStage)
            const on = c.id === coach.id
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!open}
                onClick={() => onCoach(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition active:scale-[0.99]",
                  on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border",
                  !open && "opacity-55",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full font-display text-xl",
                    on ? "bg-primary-foreground text-primary" : "bg-secondary text-primary",
                  )}
                  aria-hidden
                >
                  {open ? c.name.split(" ").pop()?.[0] : <Lock className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-display text-lg uppercase leading-tight">{c.name}</span>
                    <span className={cn("truncate text-xs", on ? "opacity-80" : "text-muted-foreground")}>{c.title}</span>
                  </span>
                  <span className={cn("block text-xs", on ? "opacity-90" : "text-muted-foreground")}>
                    {open ? c.perkText : `Win ${c.unlockStage} career fights to unlock`}
                  </span>
                </span>
                {on && <Check className="size-5 shrink-0" aria-hidden />}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {perksOn ? coach.bio : "Coach perks only count in career fights, so the Daily Knockout stays fair. Your coach still has your back in the corner."}
        </p>
      </section>

      <section aria-labelledby="gear-h">
        <h2 id="gear-h" className="mb-2 font-display text-xl uppercase">
          Gear
        </h2>
        <div className="flex flex-wrap gap-2">
          {GEAR.map((g) =>
            cosmetics[g.key] ? (
              <span key={g.key} className="flex items-center gap-1 rounded-full bg-success/20 px-3 py-1.5 text-sm text-success">
                <Check className="size-4" aria-hidden /> {g.label}
              </span>
            ) : (
              <button key={g.key} type="button" onClick={onShop} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm text-muted-foreground active:scale-95">
                <ShoppingBag className="size-4" aria-hidden /> {g.label}
              </button>
            ),
          )}
        </div>
      </section>
    </ScreenShell>
  )
}
