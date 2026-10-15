"use client"

import { BELTS, bestBelt } from "@/lib/game/belts"
import { cn } from "@/lib/utils"
import { BeltArt } from "./belt-art"
import { ScreenShell } from "./screen-shell"

export function BeltsScreen({ held, onBack }: { held: string[]; onBack: () => void }) {
  const worn = bestBelt(held)
  return (
    <ScreenShell title="Belts" onBack={onBack}>
      <p className="mb-4 text-sm text-muted-foreground">
        {worn ? (
          <>
            Your fighter wears the <span className="font-bold text-primary">{worn.name}</span> into the ring.
          </>
        ) : (
          "Win titles to fill your cabinet. Your best belt goes round your waist in every fight."
        )}
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[...BELTS]
          .sort((a, b) => a.rank - b.rank)
          .map((b) => {
            const earned = held.includes(b.id)
            return (
              <li key={b.id} className={cn("rounded-2xl bg-card p-4 ring-1", worn?.id === b.id ? "ring-primary" : "ring-border")}>
                <BeltArt belt={b} earned={earned} />
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg uppercase leading-tight">{b.name}</span>
                  {earned ? <span className="text-xs font-bold text-success">Won</span> : <span className="text-xs text-muted-foreground">Locked</span>}
                </div>
                <p className="text-xs text-muted-foreground">{b.how}</p>
              </li>
            )
          })}
      </ul>
    </ScreenShell>
  )
}
