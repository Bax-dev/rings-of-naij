"use client"

import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export function ScreenShell({
  title,
  onBack,
  right,
  footer,
  children,
}: {
  title: string
  onBack: () => void
  right?: React.ReactNode
  /** Pinned under the scrolling content, for the screen's main action. */
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="flex shrink-0 items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={onBack}
          className="flex size-11 items-center justify-center rounded-full bg-secondary text-foreground active:scale-95"
          aria-label="Back"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <h1 className="flex-1 font-display text-2xl uppercase tracking-wide text-balance sm:text-3xl">{title}</h1>
        {right}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4", footer ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]")}>{children}</div>
      {footer && <div className="shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </div>
  )
}
