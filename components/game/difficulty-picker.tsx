"use client"

import { DIFFICULTIES, type Difficulty } from "@/lib/game/belts"
import { cn } from "@/lib/utils"

export function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  const current = DIFFICULTIES.find((d) => d.id === value)
  return (
    <div className="mb-4">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-secondary p-1" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={value === d.id}
            onClick={() => onChange(d.id)}
            className={cn(
              "min-h-10 rounded-full font-display text-sm uppercase",
              value === d.id ? (d.id === "hard" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground") : "text-muted-foreground",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">{current?.blurb}</p>
    </div>
  )
}
