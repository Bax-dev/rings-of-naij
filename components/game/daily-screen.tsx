"use client"

import { CalendarDays, MapPin, Music } from "lucide-react"
import type { FighterDef, OpponentDef } from "@/lib/game/fighters"
import { ScreenShell } from "./screen-shell"

export function DailyScreen({
  opponent,
  fighter,
  best,
  onBack,
  onFight,
  onChangeFighter,
}: {
  opponent: OpponentDef
  fighter: FighterDef
  best: number | null
  onBack: () => void
  onFight: () => void
  onChangeFighter: () => void
}) {
  return (
    <ScreenShell title="Daily Knockout" onBack={onBack}>
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          <div className="h-2" style={{ backgroundColor: opponent.colors.gloves }} />
          <div className="flex flex-col gap-3 p-5">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden /> Today&apos;s challenger
            </p>
            <h2 className="font-display text-[clamp(2.25rem,11vw,3rem)] uppercase leading-none text-primary">{opponent.name}</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <MapPin className="size-4" aria-hidden /> {opponent.venue}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1">
                <Music className="size-4" aria-hidden /> {opponent.bpm} BPM
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Same fight for everyone today. Win fast, stay on the beat and dodge clean for a bigger score.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-card p-4 ring-1 ring-border">
          <span className="text-sm text-muted-foreground">Your best today</span>
          <span className="font-display text-3xl tabular-nums">{best ? best.toLocaleString() : "—"}</span>
        </div>

        <button type="button" onClick={onChangeFighter} className="rounded-2xl bg-secondary p-3 text-sm">
          Fighting as <span className="font-bold">{fighter.name}</span> · Change
        </button>

        <button
          type="button"
          onClick={onFight}
          className="rounded-2xl bg-primary py-4 font-display text-2xl uppercase text-primary-foreground shadow-[0_6px_0_#a07f00] active:translate-y-1 active:shadow-[0_2px_0_#a07f00]"
        >
          Fight
        </button>
      </div>
    </ScreenShell>
  )
}
