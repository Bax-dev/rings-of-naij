"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { RotateCcw } from "lucide-react"
import { FEMALE_FIGHTERS, boxerLook, hashString, std } from "@/lib/game/avatar3d"
import { bestBelt } from "@/lib/game/belts"
import {
  ARM_TATTOO_OPTIONS,
  BEARD_OPTIONS,
  CHAIN_OPTIONS,
  DYE_OPTIONS,
  HAIR_COLOURS,
  HAIR_OPTIONS,
  KIT_COLOURS,
  TATTOO_OPTIONS,
  applyCustom,
  type Custom,
} from "@/lib/game/customize"
import type { FighterDef } from "@/lib/game/fighters"
import { AvatarPreview } from "@/lib/game/preview3d"
import { cn } from "@/lib/utils"
import { ScreenShell } from "./screen-shell"

type Tab = "hair" | "ink" | "kit"

export function StudioScreen({
  fighter,
  custom,
  belts,
  onChange,
  onBack,
  onChangeFighter,
}: {
  fighter: FighterDef
  custom: Custom | undefined
  belts: string[]
  onChange: (c: Custom | undefined) => void
  onBack: () => void
  onChangeFighter: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<AvatarPreview | null>(null)
  const [tab, setTab] = useState<Tab>("hair")
  const [failed, setFailed] = useState(false)
  const female = FEMALE_FIGHTERS.has(fighter.id)
  const c = custom ?? {}
  const belt = bestBelt(belts)

  const look = useMemo(
    () =>
      applyCustom(
        boxerLook(fighter.id, fighter.colors, { female, gloves: std(fighter.colors.gloves, { roughness: 0.35 }), bulk: 0.92 + fighter.power * 0.1 }),
        custom,
      ),
    [fighter, female, custom],
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

  const set = (patch: Custom) => onChange({ ...c, ...patch })

  return (
    <ScreenShell
      title="Studio"
      onBack={onBack}
      right={
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="flex size-11 items-center justify-center rounded-full bg-secondary active:scale-95"
          aria-label="Reset to default look"
        >
          <RotateCcw className="size-5" aria-hidden />
        </button>
      }
    >
      <div className="relative h-[38dvh] min-h-56 overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a1d3a] to-[#14101f] ring-1 ring-border">
        <canvas ref={canvasRef} className="h-full w-full touch-none" aria-label={`3D preview of ${fighter.name}. Drag to turn.`} />
        {failed && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">3D preview isn&apos;t available on this device.</p>}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
          <span className="font-display text-2xl uppercase leading-none">{fighter.name}</span>
          {belt && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{belt.name}</span>}
        </div>
        <button type="button" onClick={onChangeFighter} className="absolute top-3 right-3 rounded-full bg-background/80 px-3 py-1.5 text-xs font-bold backdrop-blur active:scale-95">
          Change fighter
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-secondary p-1" role="tablist">
        {(
          [
            ["hair", "Hair"],
            ["ink", "Tattoos"],
            ["kit", "Kit"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("rounded-full py-2 font-display text-sm uppercase", tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-5 pb-4">
        {tab === "hair" && (
          <>
            <Group label="Style">
              {HAIR_OPTIONS.map((o) => (
                <Chip key={o.id} on={look.hair === o.id} onClick={() => set({ hair: o.id })}>
                  {o.label}
                </Chip>
              ))}
            </Group>
            <Group label="Colour">
              {HAIR_COLOURS.map((col) => (
                <Swatch key={col} color={col} on={look.hairColor === col} onClick={() => set({ hairColor: col })} />
              ))}
            </Group>
            <Group label="Dyed tips">
              {DYE_OPTIONS.map((col) => (
                <Swatch key={col ?? "none"} color={col} on={look.tipColor === col} onClick={() => set({ tipColor: col })} />
              ))}
            </Group>
            {!female && (
              <Group label="Beard">
                {BEARD_OPTIONS.map((o) => (
                  <Chip key={o.id} on={look.beard === o.id} onClick={() => set({ beard: o.id })}>
                    {o.label}
                  </Chip>
                ))}
              </Group>
            )}
          </>
        )}

        {tab === "ink" && (
          <>
            {(
              [
                ["chest", "Chest", TATTOO_OPTIONS],
                ["back", "Back", TATTOO_OPTIONS],
                ["armL", "Left arm", ARM_TATTOO_OPTIONS],
                ["armR", "Right arm", ARM_TATTOO_OPTIONS],
                ["leg", "Leg", ARM_TATTOO_OPTIONS],
              ] as const
            ).map(([key, label, opts]) => (
              <Group key={key} label={label}>
                {opts.map((o) => (
                  <Chip key={o.id ?? "none"} on={look.tattoos[key] === o.id} onClick={() => set({ [key]: o.id })}>
                    {o.label}
                  </Chip>
                ))}
              </Group>
            ))}
          </>
        )}

        {tab === "kit" && (
          <>
            <Group label="Trunks">
              {KIT_COLOURS.map((col) => (
                <Swatch key={col} color={col} on={look.bottomColor === col} onClick={() => set({ trunks: col })} />
              ))}
            </Group>
            <Group label={female ? "Top and waistband" : "Waistband and headband"}>
              {KIT_COLOURS.map((col) => (
                <Swatch key={col} color={col} on={look.accent === col} onClick={() => set({ accent: col })} />
              ))}
            </Group>
            <Group label="Boots">
              {KIT_COLOURS.map((col) => (
                <Swatch key={col} color={col} on={look.shoes === col} onClick={() => set({ shoes: col })} />
              ))}
            </Group>
            <Group label="Chain">
              {CHAIN_OPTIONS.map((col) => (
                <Swatch key={col ?? "none"} color={col} on={look.chain === col} onClick={() => set({ chain: col })} />
              ))}
            </Group>
            <Group label="Earrings">
              <Chip on={look.earrings} onClick={() => set({ earrings: true })}>
                On
              </Chip>
              <Chip on={!look.earrings} onClick={() => set({ earrings: false })}>
                Off
              </Chip>
            </Group>
          </>
        )}
        <p className="text-xs text-muted-foreground">Your look shows in every fight, and other players see it online.</p>
      </div>
    </ScreenShell>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 font-display text-sm uppercase text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("min-h-11 rounded-full px-4 text-sm font-medium ring-1 active:scale-95", on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border")}
    >
      {children}
    </button>
  )
}

function Swatch({ color, on, onClick }: { color: string | null; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={color ?? "None"}
      onClick={onClick}
      className={cn("relative size-11 rounded-full ring-2 active:scale-95", on ? "ring-primary ring-offset-2 ring-offset-background" : "ring-border")}
      style={{ background: color ?? "repeating-linear-gradient(45deg,#2a2236 0 6px,#3b3346 6px 12px)" }}
    />
  )
}
