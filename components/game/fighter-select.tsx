"use client"

import Image from "next/image"
import { Lock } from "lucide-react"
import { FIGHTERS, type FighterDef } from "@/lib/game/fighters"
import { PRODUCTS, formatNaira } from "@/lib/products"
import { cn } from "@/lib/utils"
import { ScreenShell } from "./screen-shell"

export function isFighterUnlocked(f: FighterDef, careerStage: number, owns: (id: string) => boolean) {
  if (f.unlock.type === "free") return true
  if (f.unlock.type === "career") return careerStage >= f.unlock.stage
  return owns(f.unlock.productId)
}

export function FighterSelect({
  selectedId,
  careerStage,
  owns,
  onBack,
  onSelect,
  onShop,
}: {
  selectedId: string
  careerStage: number
  owns: (id: string) => boolean
  onBack: () => void
  onSelect: (id: string) => void
  onShop: () => void
}) {
  return (
    <ScreenShell title="Fighters" onBack={onBack}>
      <ul className="flex flex-col gap-3">
        {FIGHTERS.map((f) => {
          const unlocked = isFighterUnlocked(f, careerStage, owns)
          const selected = f.id === selectedId
          const product = f.unlock.type === "purchase" ? PRODUCTS.find((p) => p.id === (f.unlock as { productId: string }).productId) : null
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => (unlocked ? onSelect(f.id) : product ? onShop() : undefined)}
                aria-pressed={selected}
                className={cn(
                  "flex w-full gap-3 overflow-hidden rounded-2xl bg-card p-3 text-left ring-2 active:scale-[0.99]",
                  selected ? "ring-primary" : "ring-transparent",
                )}
              >
                <div className="relative size-24 shrink-0 overflow-hidden rounded-xl" style={{ backgroundColor: f.colors.gloves }}>
                  <Image src={f.portrait || "/placeholder.svg"} alt={f.name} fill sizes="96px" className={cn("object-cover", !unlocked && "grayscale")} />
                  {!unlocked && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Lock className="size-6" aria-hidden />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-display text-xl uppercase leading-none">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{f.style}</span>
                  <span className="text-xs">
                    <span className="text-success">+ {f.strength}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span className="text-accent">- {f.weakness}</span>
                  </span>
                  <span className="mt-auto text-xs font-medium">
                    {selected ? (
                      <span className="text-primary">Selected</span>
                    ) : unlocked ? (
                      "Tap to pick"
                    ) : f.unlock.type === "career" ? (
                      `Beat fight ${f.unlock.stage} in career`
                    ) : (
                      <span className="text-primary">Unlock in shop · {product ? formatNaira(product.price) : ""}</span>
                    )}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </ScreenShell>
  )
}
