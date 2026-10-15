"use client"

import { ArrowDown, ArrowLeftRight, ArrowUp, Hand, Music, Pointer, Zap } from "lucide-react"
import { COMBOS } from "@/lib/game/powers"

const TIPS = [
  { icon: Pointer, title: "Tap left or right", body: "Throw a left or right punch." },
  { icon: Music, title: "Hit on the beat", body: "Punch when the yellow dots meet the ring. On-beat hits do more damage and fill your vibe." },
  { icon: ArrowUp, title: "Swipe up or down", body: "Slip or duck. Dodge when their glove glows to open a counter." },
  { icon: Hand, title: "Hold anywhere", body: "Block. Takes much less damage, but not from uppercuts (red glow)." },
  { icon: ArrowLeftRight, title: "Swipe left or right", body: "Side-step around the ring. A quick step also slips a punch." },
  { icon: Zap, title: "Full vibe", body: "Tap your superpower button. Watch for theirs: a glowing aura means a power is coming, so dodge it." },
]

const COMBO_KEYS = { L: "L", R: "R", U: "↑", D: "↓", "<": "←", ">": "→" } as const

export function TutorialOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto overscroll-contain bg-background/85 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="howto">
      <div className="mx-auto mt-auto flex w-full max-w-xl flex-col gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:mb-auto">
        <h2 id="howto" className="font-display text-[clamp(2rem,10vw,2.25rem)] uppercase text-primary">How to fight</h2>
        <ul className="flex flex-col gap-3">
          {TIPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="rounded-xl bg-card p-3 ring-1 ring-border">
          <p className="font-display text-sm uppercase text-primary">Combos (punches on the beat)</p>
          <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
            {COMBOS.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="font-semibold">{c.name}</span>
                <span className="font-mono text-muted-foreground">{c.seq.map((k) => COMBO_KEYS[k]).join(" ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">When you see FINISH AM!, land one more blow for the K.O.</p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowDown className="size-3.5" aria-hidden />
          On a computer: arrow keys punch and dodge, A and D side-step, hold Space to block, S for your superpower.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="rounded-2xl bg-primary py-4 font-display text-2xl uppercase text-primary-foreground shadow-[0_6px_0_#a07f00] active:translate-y-1 active:shadow-[0_2px_0_#a07f00]"
        >
          {"Let's go"}
        </button>
      </div>
    </div>
  )
}
