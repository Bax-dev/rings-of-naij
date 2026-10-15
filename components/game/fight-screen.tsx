"use client"

import { useEffect, useRef, useState } from "react"
import { useVatar } from "@/components/vatar/vatar-provider"
import { audio } from "@/lib/game/audio"
import { FightEngine, type FightConfig, type FightResult, type HudState } from "@/lib/game/engine"
import { sendReaction } from "@/lib/pvp/client"
import { REACTIONS } from "@/lib/pvp/types"
import { FightHud } from "./fight-hud"
import { FullscreenButton } from "./fullscreen-button"
import { TutorialOverlay } from "./tutorial-overlay"

export function FightScreen({
  config,
  showTutorial,
  onTutorialDone,
  onEnd,
  onQuit,
  watchMatchId,
  viewerName,
}: {
  config: FightConfig
  showTutorial: boolean
  onTutorialDone: () => void
  onEnd: (r: FightResult) => void
  onQuit: () => void
  /** Set when spectating someone else's online fight. */
  watchMatchId?: string
  viewerName?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FightEngine | null>(null)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd
  const mode = config.mode ?? "cpu"
  const online = mode !== "cpu"
  const [hud, setHud] = useState<HudState | null>(null)
  const [tutorial, setTutorial] = useState(showTutorial && mode !== "watch")
  const [userPaused, setUserPaused] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [lastCheer, setLastCheer] = useState(0)
  const { paused: worldPaused } = useVatar()

  useEffect(() => {
    const canvas = canvasRef.current
    // Online fights run on the shared clock, so they start straight away even if the tips are open.
    if (!canvas || (tutorial && !online)) return
    const engine = new FightEngine(canvas, config, { onHud: setHud, onEnd: (r) => onEndRef.current(r) })
    engineRef.current = engine
    engine.start()
    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(canvas)
    return () => {
      ro.disconnect()
      engine.destroy()
      engineRef.current = null
    }
  }, [config, tutorial, online])

  useEffect(() => {
    // An online fight can't be paused: the other fighter's clock keeps running.
    if (online) return
    engineRef.current?.setPaused(worldPaused || userPaused)
  }, [worldPaused, userPaused, hud === null, online])

  useEffect(() => {
    if (online) return
    const onVisibility = () => {
      if (document.hidden) setUserPaused(true)
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [online])

  const cheer = (e: string) => {
    if (!watchMatchId || Date.now() - lastCheer < 1000) return
    setLastCheer(Date.now())
    void sendReaction(watchMatchId, viewerName ?? "Fan", e)
  }

  const verb = mode === "watch" ? "Watching" : "Fight against"
  return (
    <div className="relative h-full w-full overflow-hidden bg-background select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label={`${verb} ${config.oppName ?? config.opponent.name}. Tap left or right to punch, swipe up or down to dodge, swipe sideways to move, hold to block.`}
      />
      {hud && (
        <FightHud
          hud={hud}
          playerName={config.playerName ?? config.fighter.name}
          oppName={config.oppName ?? config.opponent.name}
          specialName={engineRef.current?.playerPower.name ?? config.fighter.signature.name}
          tape={{
            venue: config.opponent.venue,
            coachName: config.coach?.name ?? null,
            player: { sub: config.fighter.style, hp: hud.playerMax, power: config.fighter.power },
            opp: {
              sub: config.oppFighter?.style ?? config.opponent.title,
              hp: hud.oppMax,
              power: config.oppFighter?.power ?? config.opponent.power,
            },
          }}
          onPause={() => (mode === "watch" ? onQuit() : online ? setLeaving(true) : setUserPaused(true))}
          onSpecial={() => {
            audio.unlock()
            engineRef.current?.triggerSpecial()
          }}
        />
      )}
      {mode === "watch" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => cheer(e)}
              className="flex size-12 items-center justify-center rounded-full bg-background/75 text-2xl backdrop-blur active:scale-90"
              aria-label={`Send ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {tutorial && (
        <TutorialOverlay
          onStart={() => {
            audio.unlock()
            setTutorial(false)
            onTutorialDone()
          }}
        />
      )}
      {userPaused && !tutorial && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/85 px-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Paused">
          <h2 className="font-display text-5xl uppercase text-primary">Paused</h2>
          <button
            type="button"
            onClick={() => {
              audio.unlock()
              setUserPaused(false)
            }}
            className="w-full max-w-xs rounded-2xl bg-primary py-4 font-display text-2xl uppercase text-primary-foreground"
          >
            Resume
          </button>
          <button type="button" onClick={onQuit} className="w-full max-w-xs rounded-2xl bg-secondary py-3 font-display text-xl uppercase">
            Quit fight
          </button>
          <FullscreenButton className="bg-secondary" />
        </div>
      )}
      {leaving && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/85 px-8 text-center backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Leave fight">
          <h2 className="font-display text-4xl uppercase text-primary">Leave the fight?</h2>
          <p className="text-sm text-muted-foreground">The fight carries on without you, and it counts as a loss.</p>
          <button type="button" onClick={() => setLeaving(false)} className="w-full max-w-xs rounded-2xl bg-primary py-4 font-display text-2xl uppercase text-primary-foreground">
            Keep fighting
          </button>
          <button type="button" onClick={onQuit} className="w-full max-w-xs rounded-2xl bg-secondary py-3 font-display text-xl uppercase">
            Leave
          </button>
        </div>
      )}
      {worldPaused && !userPaused && !online && <div className="pointer-events-none absolute inset-0 z-10 bg-background/50" aria-hidden />}
    </div>
  )
}
