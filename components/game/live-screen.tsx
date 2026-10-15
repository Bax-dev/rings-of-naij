"use client"

import { useEffect, useState } from "react"
import { Eye, Radio } from "lucide-react"
import { FIGHTERS } from "@/lib/game/fighters"
import { fetchLive } from "@/lib/pvp/client"
import type { LiveMatch } from "@/lib/pvp/types"
import { ScreenShell } from "./screen-shell"

/** The gallery: online fights happening right now, open to anyone to watch. */
export function LiveScreen({ onWatch, onBack, onFight }: { onWatch: (m: LiveMatch) => void; onBack: () => void; onFight: () => void }) {
  const [matches, setMatches] = useState<LiveMatch[] | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const m = await fetchLive()
      if (alive) setMatches(m)
    }
    void load()
    const id = setInterval(load, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const watching = matches?.reduce((n, m) => n + m.watchers, 0) ?? 0
  const name = (id: string) => FIGHTERS.find((f) => f.id === id)?.name ?? id

  return (
    <ScreenShell title="Watch live" onBack={onBack}>
      <div className="rounded-2xl bg-[#3a2418] p-4 text-[#fbeee0] ring-1 ring-[#5a3a28]">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[#c2410c] px-2 py-0.5 text-xs font-bold uppercase">Fight card</span>
          <span className="text-sm opacity-80">Ring of Lagos</span>
        </div>
        <p className="mt-2 flex items-center gap-2 text-sm font-bold">
          <Radio className="size-4 text-[#ff4d3d]" aria-hidden />
          LIVE: {matches?.length ?? 0} fights · {watching} watching
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {matches === null && <li className="text-sm opacity-70">Loading…</li>}
          {matches?.length === 0 && <li className="text-sm opacity-70">No fights on right now. Start one and the gallery will come.</li>}
          {matches?.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl bg-black/20 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  @{m.players[0].name} v. @{m.players[1].name}
                </span>
                <span className="block truncate text-xs opacity-70">
                  {name(m.players[0].fighterId)} vs {name(m.players[1].fighterId)} · <Eye className="inline size-3" aria-hidden /> {m.watchers}
                </span>
              </span>
              <button type="button" onClick={() => onWatch(m)} className="rounded-full bg-[#c2410c] px-4 py-2 text-sm font-bold active:scale-95">
                Watch
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onFight} className="mt-4 w-full rounded-2xl bg-primary py-3.5 font-display text-xl uppercase text-primary-foreground">
        Start your own fight
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground">Spectators can send cheers. The fighters see them pop up in the ring.</p>
    </ScreenShell>
  )
}
