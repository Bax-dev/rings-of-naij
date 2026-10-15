"use client"

import Image from "next/image"
import { Check, Crown, Lock, Play } from "lucide-react"
import type { Difficulty } from "@/lib/game/belts"
import { CAREER, type FighterDef } from "@/lib/game/fighters"
import { cn } from "@/lib/utils"
import { DifficultyPicker } from "./difficulty-picker"
import { ScreenShell } from "./screen-shell"

export function CareerScreen({
  careerStage,
  fighter,
  onBack,
  onChangeFighter,
  onFight,
  difficulty,
  onDifficulty,
}: {
  difficulty: Difficulty
  onDifficulty: (d: Difficulty) => void
  careerStage: number
  fighter: FighterDef
  onBack: () => void
  onChangeFighter: () => void
  onFight: (stage: number) => void
}) {
  return (
    <ScreenShell title="Career" onBack={onBack}>
      <button
        type="button"
        onClick={onChangeFighter}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left ring-1 ring-border active:scale-[0.99]"
      >
        <Image src={fighter.portrait || "/placeholder.svg"} alt="" width={56} height={56} className="size-14 rounded-xl object-cover" />
        <span className="flex-1">
          <span className="block text-xs text-muted-foreground">Your fighter</span>
          <span className="block font-display text-xl uppercase">{fighter.name}</span>
        </span>
        <span className="rounded-full bg-secondary px-3 py-1.5 text-sm font-medium">Change</span>
      </button>

      <DifficultyPicker value={difficulty} onChange={onDifficulty} />

      <ol className="flex flex-col gap-2">
        {CAREER.map((opp, i) => {
          const beaten = i < careerStage
          const current = i === careerStage
          const locked = i > careerStage
          const boss = i === CAREER.length - 1
          return (
            <li key={opp.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onFight(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition active:scale-[0.99]",
                  current ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border",
                  locked && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg",
                    current ? "bg-primary-foreground text-primary" : "bg-secondary",
                  )}
                >
                  {boss ? <Crown className="size-5" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg uppercase leading-tight">{opp.name}</span>
                  <span className={cn("block truncate text-xs", current ? "opacity-80" : "text-muted-foreground")}>
                    {opp.venue} · {opp.bpm} BPM
                  </span>
                </span>
                {beaten && <Check className="size-5 text-success" aria-label="Beaten" />}
                {current && <Play className="size-5" aria-label="Next fight" />}
                {locked && <Lock className="size-4" aria-label="Locked" />}
              </button>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-center text-xs text-muted-foreground">Beat King Eko to win a belt. Each difficulty has its own.</p>
    </ScreenShell>
  )
}
