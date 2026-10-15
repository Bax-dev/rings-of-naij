"use client"

import { Eye, LogOut, Pause, Zap } from "lucide-react"
import type { ReactNode } from "react"
import type { HudState } from "@/lib/game/engine"
import { cn } from "@/lib/utils"

function HealthBar({ label, hp, max, vibe, align }: { label: string; hp: number; max: number; vibe?: number; align: "left" | "right" }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100))
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className={cn("truncate font-display text-sm uppercase leading-none", align === "right" && "text-right")}>{label}</span>
      <div
        className="h-3.5 overflow-hidden rounded-full bg-background/80 ring-2 ring-background"
        role="meter"
        aria-label={`${label} health`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={hp}
      >
        <div
          className={cn("h-full transition-[width] duration-150", pct > 30 ? "bg-success" : "bg-accent", align === "right" && "ml-auto")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {vibe !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-background/70" role="meter" aria-label={`${label} power`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={vibe}>
          <div className={cn("h-full bg-[#8b4dff] transition-[width] duration-150", vibe >= 100 && "animate-pulse", align === "right" && "ml-auto")} style={{ width: `${vibe}%` }} />
        </div>
      )}
    </div>
  )
}

export interface TaleOfTape {
  venue: string
  coachName: string | null
  player: { sub: string; hp: number; power: number }
  opp: { sub: string; hp: number; power: number }
}

function TapeRow({ label, left, right }: { label: string; left: number; right: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <span className={cn("font-display text-2xl tabular-nums", left > right ? "text-primary" : "text-foreground")}>{left}</span>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={cn("text-right font-display text-2xl tabular-nums", right > left ? "text-accent" : "text-foreground")}>{right}</span>
    </div>
  )
}

/** The stare-down: tale of the tape while the referee gives the instructions. */
function FaceOffCard({ tape, playerName, oppName }: { tape: TaleOfTape; playerName: string; oppName: string }) {
  return (
    <div className="mx-auto w-full max-w-md animate-in fade-in slide-in-from-bottom-6 rounded-2xl bg-background/85 p-4 ring-1 ring-border backdrop-blur duration-300">
      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-xl uppercase leading-none text-primary">{playerName}</p>
          <p className="truncate text-xs text-muted-foreground">{tape.player.sub}</p>
        </div>
        <span className="font-display text-3xl leading-none text-foreground">VS</span>
        <div className="min-w-0 text-right">
          <p className="truncate font-display text-xl uppercase leading-none text-accent">{oppName}</p>
          <p className="truncate text-xs text-muted-foreground">{tape.opp.sub}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <TapeRow label="Health" left={tape.player.hp} right={tape.opp.hp} />
        <TapeRow label="Power" left={Math.round(tape.player.power * 100)} right={Math.round(tape.opp.power * 100)} />
      </div>
      <p className="mt-2 text-center text-xs uppercase tracking-widest text-muted-foreground">
        {tape.venue}
        {tape.coachName && ` · In your corner: ${tape.coachName}`}
      </p>
    </div>
  )
}

/** Between rounds: what your coach tells you on the stool. */
function CoachCard({ name, tip }: { name: string; tip: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md animate-in items-start gap-3 fade-in slide-in-from-bottom-6 duration-300" role="status" aria-live="polite">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-display text-2xl text-primary-foreground ring-4 ring-background/80" aria-hidden>
        {name.split(" ").pop()?.[0]}
      </span>
      <div className="relative min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-background/90 p-3 ring-1 ring-border backdrop-blur">
        <p className="font-display text-sm uppercase text-primary">{name}</p>
        <p className="text-[15px] leading-snug">{tip}</p>
      </div>
    </div>
  )
}

export function FightHud({
  hud,
  playerName,
  oppName,
  specialName,
  tape,
  onPause,
  onSpecial,
}: {
  hud: HudState
  playerName: string
  oppName: string
  specialName: string
  tape: TaleOfTape
  onPause: () => void
  onSpecial: () => void
}) {
  const watching = hud.mode === "watch"
  const online = hud.mode !== "cpu"
  const ready = hud.vibe >= 100 && hud.phase === "fight"
  const action = hud.phase === "fight" || hud.phase === "intro"
  let card: ReactNode = null
  if (hud.phase === "faceoff") card = <FaceOffCard tape={tape} playerName={playerName} oppName={oppName} />
  else if (hud.phase === "break" && hud.coachTip && tape.coachName && !watching) card = <CoachCard name={tape.coachName} tip={hud.coachTip} />
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto max-w-3xl px-[max(0.75rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start gap-2">
          <HealthBar label={playerName} hp={hud.playerHp} max={hud.playerMax} vibe={watching ? hud.vibe : undefined} align="left" />
          <div className="flex shrink-0 flex-col items-center">
            <span className="font-display text-2xl leading-none tabular-nums">{hud.timeLeft}</span>
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Rd {hud.round}/3</span>
          </div>
          <HealthBar label={oppName} hp={hud.oppHp} max={hud.oppMax} vibe={hud.oppVibe} align="right" />
          <button
            type="button"
            onClick={onPause}
            className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-background/80 active:scale-95"
            aria-label={online ? "Leave" : "Pause"}
          >
            {online ? <LogOut className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {!watching && (
            <>
              <span className="font-display text-xs uppercase text-primary">Vibe</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-background/80" role="meter" aria-label="Vibe" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hud.vibe}>
                <div className={cn("h-full bg-primary transition-[width] duration-150", ready && "animate-pulse")} style={{ width: `${hud.vibe}%` }} />
              </div>
              {hud.combo >= 2 && <span className="font-display text-sm text-primary tabular-nums">x{hud.combo}</span>}
            </>
          )}
          {online && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs font-bold">
              <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
              LIVE
              <Eye className="ml-1 size-3.5" aria-hidden />
              {hud.watchers}
            </span>
          )}
        </div>
      </div>

      {(card || hud.skippable) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-[max(1rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          {card}
          {hud.skippable && (
            <span className="animate-pulse rounded-full bg-background/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Tap to skip</span>
          )}
        </div>
      )}

      {!watching && action && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onSpecial}
            disabled={!ready}
            className={cn(
              "pointer-events-auto flex items-center gap-2 rounded-full px-5 py-3 font-display text-lg uppercase transition",
              ready
                ? "animate-bounce bg-primary text-primary-foreground shadow-[0_0_24px_#f5c400]"
                : "bg-background/70 text-muted-foreground opacity-70",
            )}
          >
            <Zap className="size-5" aria-hidden />
            {ready ? specialName : `Power ${hud.vibe}%`}
          </button>
        </div>
      )}
    </>
  )
}
