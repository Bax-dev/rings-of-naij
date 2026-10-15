"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { Award, CalendarDays, Eye, Globe, Palette, Radio, ShoppingBag, Swords, Trophy, Users, Volume2, VolumeX } from "lucide-react"
import { fetchLive } from "@/lib/pvp/client"
import type { LiveMatch } from "@/lib/pvp/types"
import { useVatar } from "@/components/vatar/vatar-provider"
import { CAREER } from "@/lib/game/fighters"
import { friendlyError } from "@/lib/vatar/types"
import { FullscreenButton } from "./fullscreen-button"

export type MenuTarget = "career" | "daily" | "select" | "shop" | "leaderboard" | "studio" | "belts" | "versus" | "live"

export function MenuScreen({
  careerStage,
  muted,
  onToggleMute,
  onNavigate,
}: {
  careerStage: number
  muted: boolean
  onToggleMute: () => void
  onNavigate: (to: MenuTarget) => void
}) {
  const { status, player, mode } = useVatar()
  const champion = careerStage >= CAREER.length
  const [live, setLive] = useState<LiveMatch[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const m = await fetchLive()
      if (alive) setLive(m)
    }
    void load()
    const id = setInterval(load, 10000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain">
      <div className="relative h-[42dvh] min-h-48 w-full shrink-0 overflow-hidden">
        <Image src="/images/key-art.png" alt="" fill priority className="object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background" />
        <div className="absolute inset-x-0 top-0 mx-auto flex max-w-xl items-center justify-between gap-2 px-[max(1rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-background/70 py-1 pr-3 pl-1 backdrop-blur">
            {player?.avatar ? (
              <img src={player.avatar || "/placeholder.svg"} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-full bg-primary font-display text-primary-foreground">
                {(player?.name ?? "P").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm font-medium">{player?.name ?? (status === "loading" ? "Connecting…" : "Practice mode")}</span>
            {mode === "test" && <span className="rounded bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">TEST</span>}
          </div>
          <div className="flex shrink-0 gap-2">
            <FullscreenButton />
            <button
              type="button"
              onClick={onToggleMute}
              className="flex size-11 items-center justify-center rounded-full bg-background/70 backdrop-blur active:scale-95"
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
            >
              {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>

      <div className="relative mx-auto -mt-16 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="relative">
          <h1 className="font-display text-[clamp(2.75rem,14vw,3.75rem)] leading-none uppercase text-primary [text-shadow:0_4px_0_#14101f]">
            Ring of Lagos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Hit on the beat. Build the vibe. Own the street.</p>
        </div>

        {status === "practice" && (
          <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {friendlyError("not_framed")} You can still play career here.
          </p>
        )}

        <button
          type="button"
          onClick={() => onNavigate("career")}
          className="flex items-center gap-4 rounded-2xl bg-primary p-4 text-left text-primary-foreground shadow-[0_6px_0_#a07f00] active:translate-y-1 active:shadow-[0_2px_0_#a07f00]"
        >
          <Swords className="size-8 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block font-display text-2xl uppercase">Career</span>
            <span className="block text-sm font-medium opacity-80">
              {champion ? "You are Champion of Lagos" : `Fight ${careerStage + 1} of ${CAREER.length}: ${CAREER[careerStage].name}`}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("versus")}
          className="flex items-center gap-4 rounded-2xl bg-accent p-4 text-left text-accent-foreground shadow-[0_6px_0_#8f241a] active:translate-y-1 active:shadow-[0_2px_0_#8f241a]"
        >
          <Globe className="size-8 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block font-display text-2xl uppercase">Online fight</span>
            <span className="block text-sm font-medium opacity-85">Quick match or challenge a friend</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("live")}
          className="flex items-center gap-3 rounded-2xl bg-[#3a2418] p-3 text-left text-[#fbeee0] ring-1 ring-[#5a3a28] active:scale-[0.99]"
        >
          <span className="rounded-md bg-[#c2410c] px-2 py-0.5 text-xs font-bold uppercase">Fight card</span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold">
            <Radio className="size-4 shrink-0 text-[#ff4d3d]" aria-hidden />
            <span className="truncate">
              {live.length ? `LIVE: ${live.length} fights · ${live.reduce((n, m) => n + m.watchers, 0)} watching` : "Watch live fights"}
            </span>
          </span>
          <Eye className="size-5 shrink-0" aria-hidden />
        </button>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MenuTile icon={<CalendarDays className="size-6" aria-hidden />} label="Daily Knockout" onClick={() => onNavigate("daily")} />
          <MenuTile icon={<Users className="size-6" aria-hidden />} label="Fighters" onClick={() => onNavigate("select")} />
          <MenuTile icon={<Palette className="size-6" aria-hidden />} label="Studio" onClick={() => onNavigate("studio")} />
          <MenuTile icon={<Award className="size-6" aria-hidden />} label="Belts" onClick={() => onNavigate("belts")} />
          <MenuTile icon={<ShoppingBag className="size-6" aria-hidden />} label="Shop" onClick={() => onNavigate("shop")} />
          <MenuTile icon={<Trophy className="size-6" aria-hidden />} label="Leaderboard" onClick={() => onNavigate("leaderboard")} />
        </div>
      </div>
    </div>
  )
}

function MenuTile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col items-start justify-between gap-2 rounded-2xl bg-card p-4 text-left ring-1 ring-border active:scale-[0.98]"
    >
      <span className="text-primary">{icon}</span>
      <span className="font-display text-lg uppercase leading-none">{label}</span>
    </button>
  )
}
