"use client"

import useSWR from "swr"
import { Crown, RefreshCw } from "lucide-react"
import { useVatar } from "@/components/vatar/vatar-provider"
import { errorCode, friendlyError } from "@/lib/vatar/types"
import { cn } from "@/lib/utils"
import { ScreenShell } from "./screen-shell"

export function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const { status, leaderboard } = useVatar()
  const { data, error, isLoading, mutate } = useSWR(status === "ready" ? "vatar-leaderboard" : null, leaderboard, {
    revalidateOnFocus: false,
  })

  return (
    <ScreenShell
      title="Leaderboard"
      onBack={onBack}
      right={
        status === "ready" ? (
          <button type="button" onClick={() => void mutate()} className="flex size-11 items-center justify-center rounded-full bg-secondary active:scale-95" aria-label="Refresh">
            <RefreshCw className={cn("size-5", isLoading && "animate-spin")} aria-hidden />
          </button>
        ) : undefined
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">Best Daily Knockout scores. A new challenger every day.</p>

      {status !== "ready" && (
        <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          {status === "loading" ? "Connecting to Lagos Life…" : friendlyError("not_framed")}
        </p>
      )}
      {error && <p className="rounded-xl bg-accent/15 p-3 text-sm text-accent">{friendlyError(errorCode(error))}</p>}

      {data && (
        <>
          {data.me && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground">
              <span className="font-display text-3xl">{data.me.rank ? `#${data.me.rank}` : "—"}</span>
              <span className="flex-1 font-semibold">{data.me.label}</span>
              <span className="font-display text-2xl tabular-nums">{data.me.score.toLocaleString()}</span>
            </div>
          )}
          {data.top.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No scores yet. Win the Daily Knockout to be first!</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {data.top.map((row) => (
                <li key={row.rank} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                  <span className={cn("w-8 font-display text-xl", row.rank <= 3 ? "text-primary" : "text-muted-foreground")}>
                    {row.rank === 1 ? <Crown className="size-5" aria-label="1st" /> : row.rank}
                  </span>
                  <span className="flex-1 truncate">{row.name}</span>
                  <span className="font-display text-lg tabular-nums">{row.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </ScreenShell>
  )
}
