"use client"

import type { BeltDef } from "@/lib/game/belts"
import type { FightResult } from "@/lib/game/engine"
import { cn } from "@/lib/utils"
import { BeltArt } from "./belt-art"

export interface ScoreStatus {
  state: "idle" | "sending" | "sent" | "error"
  message?: string
}

export function ResultsScreen({
  result,
  oppName,
  daily,
  unlockedText,
  scoreStatus,
  primaryLabel,
  onPrimary,
  onRetry,
  onMenu,
  newBelts = [],
  title,
}: {
  newBelts?: BeltDef[]
  /** Overrides the big headline, e.g. for spectators. */
  title?: string
  result: FightResult
  oppName: string
  daily: boolean
  unlockedText: string | null
  scoreStatus: ScoreStatus
  primaryLabel: string | null
  onPrimary: () => void
  onRetry: () => void
  onMenu: () => void
}) {
  const total = result.onBeat + result.offBeat
  const accuracy = total ? Math.round((result.onBeat / total) * 100) : 0
  const stats = [
    ["On-beat", `${accuracy}%`],
    ["Best streak", `x${result.maxCombo}`],
    ["Combos", String(result.combos)],
    ["Perfect dodges", String(result.perfectDodges)],
    ["Damage dealt", String(result.damageDealt)],
    ["Damage taken", String(result.damageTaken)],
  ]
  const headline =
    title ?? (result.won ? (result.finisher === "power" ? "Super K.O." : result.finisher === "combo" ? "Combo K.O." : result.ko ? "K.O. win" : "You win") : "Defeat")

  return (
    <div className="flex h-full overflow-y-auto overscroll-contain px-[max(1.25rem,env(safe-area-inset-left))] pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="m-auto flex w-full max-w-md flex-col gap-[clamp(0.75rem,2.5dvh,1.25rem)]">
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">vs {oppName}</p>
          <h1 className={cn("font-display text-[clamp(3rem,15vw,4.5rem)] uppercase leading-none", result.won ? "text-primary" : "text-accent")}>
            {headline}
          </h1>
          {result.flawless && <p className="mt-1 font-display text-2xl uppercase text-success">No scratch!</p>}
          {unlockedText && <p className="mt-3 rounded-full bg-success px-4 py-1.5 text-sm font-bold text-background inline-block">{unlockedText}</p>}
        </div>

        {newBelts.map((b) => (
          <div key={b.id} className="animate-in zoom-in-50 rounded-2xl bg-gradient-to-b from-[#3a2a10] to-card p-4 text-center ring-2 ring-primary duration-500">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">New belt</p>
            <BeltArt belt={b} earned className="mx-auto mt-2 max-w-64" />
            <p className="mt-2 font-display text-2xl uppercase">{b.name}</p>
          </div>
        ))}

        {result.mode === "cpu" && (
        <div className="rounded-2xl bg-card p-[clamp(0.75rem,2.5dvh,1.25rem)] text-center ring-1 ring-border">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Score</p>
          <p className="font-display text-[clamp(2.75rem,13vw,3.75rem)] leading-tight tabular-nums text-foreground">{result.score.toLocaleString()}</p>
          {daily && (
            <p className={cn("mt-1 text-sm", scoreStatus.state === "error" ? "text-accent" : "text-muted-foreground")} aria-live="polite">
              {scoreStatus.state === "sending" ? "Sending to leaderboard…" : scoreStatus.message}
            </p>
          )}
        </div>
        )}

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [@media(orientation:landscape)_and_(max-height:500px)]:grid-cols-6">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-card p-3 ring-1 ring-border">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-display text-xl sm:text-2xl">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-3">
          {primaryLabel && (
            <button
              type="button"
              onClick={onPrimary}
              className="rounded-2xl bg-primary py-3.5 font-display text-2xl sm:py-4 uppercase text-primary-foreground shadow-[0_6px_0_#a07f00] active:translate-y-1 active:shadow-[0_2px_0_#a07f00]"
            >
              {primaryLabel}
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onRetry} className="rounded-2xl bg-secondary py-3 font-display text-xl uppercase active:scale-[0.98]">
              Rematch
            </button>
            <button type="button" onClick={onMenu} className="rounded-2xl bg-secondary py-3 font-display text-xl uppercase active:scale-[0.98]">
              Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
