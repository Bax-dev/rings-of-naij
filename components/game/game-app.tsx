"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVatar } from "@/components/vatar/vatar-provider"
import { audio } from "@/lib/game/audio"
import { beltById, bestBelt, scaleOpponent, type BeltDef } from "@/lib/game/belts"
import { DEFAULT_COACH, coachById, isCoachUnlocked } from "@/lib/game/coaches"
import type { Custom } from "@/lib/game/customize"
import type { FightConfig, FightResult } from "@/lib/game/engine"
import { CAREER, FIGHTERS, dailyOpponent, type FighterDef, type OpponentDef } from "@/lib/game/fighters"
import { hasItem } from "@/lib/products"
import { DEFAULT_PROGRESS, loadProgress, saveProgress, type Progress } from "@/lib/progress"
import { FightLink, WatchLink } from "@/lib/pvp/client"
import type { LiveMatch, Loadout } from "@/lib/pvp/types"
import { friendlyError } from "@/lib/vatar/types"
import { BeltsScreen } from "./belts-screen"
import { CareerScreen } from "./career-screen"
import { DailyScreen } from "./daily-screen"
import { FightScreen } from "./fight-screen"
import { FighterSelect, isFighterUnlocked } from "./fighter-select"
import { LeaderboardScreen } from "./leaderboard-screen"
import { LiveScreen } from "./live-screen"
import { LockerScreen } from "./locker-screen"
import { MenuScreen, type MenuTarget } from "./menu-screen"
import { ResultsScreen, type ScoreStatus } from "./results-screen"
import { ShopScreen } from "./shop-screen"
import { StudioScreen } from "./studio-screen"
import { VersusScreen } from "./versus-screen"

type Screen = "menu" | MenuTarget | "fight" | "results" | "connecting" | "locker"

interface FightSession {
  kind: "career" | "daily" | "pvp" | "watch"
  stage: number
  opponent: OpponentDef
  config: FightConfig
  nonce: number
  link?: FightLink | WatchLink
  matchId?: string
}

function hash(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** An online fight's venue and music come from its id, so both phones (and spectators) agree. */
function onlineOpponent(matchId: string, oppFighter: FighterDef, oppName: string): OpponentDef {
  const venue = CAREER[hash(matchId) % CAREER.length]
  return { ...venue, id: oppFighter.id, name: oppName, colors: oppFighter.colors, hp: oppFighter.maxHp, power: oppFighter.power }
}

const NO_COSMETICS = { goldGloves: false, ankaraTrunks: false, talkingDrumEntrance: false }

export function GameApp() {
  const { owned, status, submitScore, player } = useVatar()
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS)
  const [screen, setScreen] = useState<Screen>("menu")
  const [selectReturn, setSelectReturn] = useState<Screen>("menu")
  const [fight, setFight] = useState<FightSession | null>(null)
  const [result, setResult] = useState<FightResult | null>(null)
  const [unlockedText, setUnlockedText] = useState<string | null>(null)
  const [newBelts, setNewBelts] = useState<BeltDef[]>([])
  const [scoreStatus, setScoreStatus] = useState<ScoreStatus>({ state: "idle" })
  const watchRef = useRef<WatchLink | null>(null)
  /** The fight waiting in the locker room, and the screen to go back to from it. */
  const [locker, setLocker] = useState<{ kind: "career" | "daily"; stage: number; from: Screen } | null>(null)
  /** Studio and shop return here when opened from the locker room, instead of the menu. */
  const [detourFrom, setDetourFrom] = useState<Screen | null>(null)

  useEffect(() => {
    const p = loadProgress()
    setProgress(p)
    audio.setMuted(p.muted)
  }, [])

  const update = useCallback((patch: Partial<Progress> | ((p: Progress) => Partial<Progress>)) => {
    setProgress((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }
      saveProgress(next)
      return next
    })
  }, [])

  const owns = useCallback((id: string) => hasItem(owned, id), [owned])

  const fighter = useMemo(() => {
    const chosen = FIGHTERS.find((f) => f.id === progress.fighterId)
    return chosen && isFighterUnlocked(chosen, progress.careerStage, owns) ? chosen : FIGHTERS[0]
  }, [progress.fighterId, progress.careerStage, owns])

  const myCustom = progress.custom[fighter.id]
  const myBelt = bestBelt(progress.belts)?.id ?? null
  const cosmetics = useMemo(
    () => ({ goldGloves: owns("gloves_gold"), ankaraTrunks: owns("trunks_ankara"), talkingDrumEntrance: owns("entrance_talkingdrum") }),
    [owns],
  )

  const coach = useMemo(() => {
    const c = coachById(progress.coachId)
    return isCoachUnlocked(c, progress.careerStage) ? c : DEFAULT_COACH
  }, [progress.coachId, progress.careerStage])

  const daily = useMemo(() => dailyOpponent(), [])
  const dailyBest = progress.dailyBest?.key === daily.key ? progress.dailyBest.score : null

  function stopLinks() {
    fight?.link?.stop()
    watchRef.current?.stop()
    watchRef.current = null
  }

  function fightOpponent(kind: "career" | "daily", stage: number) {
    const base = kind === "daily" ? daily.opponent : CAREER[stage]
    return kind === "career" ? scaleOpponent(base, progress.difficulty) : base
  }

  function openLocker(kind: "career" | "daily", stage: number, from: Screen) {
    setLocker({ kind, stage, from })
    setScreen("locker")
  }

  function startFight(kind: "career" | "daily", stage: number) {
    const opponent = fightOpponent(kind, stage)
    setFight({
      kind,
      stage,
      opponent,
      nonce: Date.now(),
      config: {
        fighter,
        opponent,
        cosmetics,
        mode: "cpu",
        difficulty: kind === "career" ? progress.difficulty : "normal",
        playerCustom: myCustom,
        playerBelt: myBelt,
        coach,
        coachPerks: kind === "career",
      },
    })
    resetResults()
    setScreen("fight")
  }

  function resetResults() {
    setResult(null)
    setUnlockedText(null)
    setNewBelts([])
    setScoreStatus({ state: "idle" })
  }

  function startOnline(link: FightLink, opp: Loadout, myName: string) {
    const oppFighter = FIGHTERS.find((f) => f.id === opp.fighterId) ?? FIGHTERS[0]
    const opponent = onlineOpponent(link.matchId, oppFighter, opp.name)
    setFight({
      kind: "pvp",
      stage: 0,
      opponent,
      nonce: Date.now(),
      link,
      matchId: link.matchId,
      config: {
        fighter,
        opponent,
        cosmetics,
        mode: "pvp",
        net: link,
        oppFighter,
        playerName: myName,
        oppName: opp.name,
        playerCustom: myCustom,
        oppCustom: opp.custom,
        playerBelt: myBelt,
        oppBelt: opp.belt,
        coach,
      },
    })
    resetResults()
    setScreen("fight")
  }

  function startWatching(m: LiveMatch) {
    stopLinks()
    const link = new WatchLink(m.id)
    watchRef.current = link
    const [a, b] = m.players
    const fa = FIGHTERS.find((f) => f.id === a.fighterId) ?? FIGHTERS[0]
    const fb = FIGHTERS.find((f) => f.id === b.fighterId) ?? FIGHTERS[1]
    const opponent = onlineOpponent(m.id, fb, b.name)
    setFight({
      kind: "watch",
      stage: 0,
      opponent,
      nonce: Date.now(),
      link,
      matchId: m.id,
      config: {
        fighter: fa,
        opponent,
        cosmetics: NO_COSMETICS,
        mode: "watch",
        net: link,
        oppFighter: fb,
        playerName: a.name,
        oppName: b.name,
        playerCustom: a.custom,
        oppCustom: b.custom,
        playerBelt: a.belt,
        oppBelt: b.belt,
      },
    })
    resetResults()
    // Wait for the first sync so the clock is right before the fight is drawn.
    setScreen("connecting")
    link.onChange = () => {
      if (link.startAt) setScreen((s) => (s === "connecting" ? "fight" : s))
    }
  }

  /** Works out which belts this result earns and records them. */
  function awardBelts(r: FightResult, kind: FightSession["kind"], stage: number): BeltDef[] {
    const earned: string[] = []
    const held = new Set(progress.belts)
    const give = (id: string) => {
      if (!held.has(id)) {
        held.add(id)
        earned.push(id)
      }
    }
    if (kind === "watch") return []
    if (r.won && r.flawless) give("flawless")
    if (kind === "career" && r.won && stage === CAREER.length - 1) give(`career_${progress.difficulty}`)
    if (kind === "daily" && r.won && progress.dailyWins + 1 >= 3) give("daily_3")
    if (kind === "pvp" && r.won) {
      const wins = progress.pvp.wins + 1
      if (wins >= 3) give("pvp_3")
      if (wins >= 10) give("pvp_10")
      if (wins >= 25) give("pvp_25")
    }
    if (earned.length) update((p) => ({ belts: [...new Set([...p.belts, ...earned])] }))
    return earned.map(beltById).filter((b): b is BeltDef => !!b)
  }

  async function onFightEnd(r: FightResult) {
    if (!fight) return
    setResult(r)
    setScreen("results")
    setNewBelts(awardBelts(r, fight.kind, fight.stage))

    if (fight.kind === "pvp") {
      update((p) => ({ pvp: { wins: p.pvp.wins + (r.won ? 1 : 0), losses: p.pvp.losses + (r.won ? 0 : 1) } }))
      return
    }
    if (fight.kind === "watch") {
      watchRef.current?.stop()
      return
    }

    if (fight.kind === "career" && r.won) {
      const reached = fight.stage + 1
      if (reached > progress.careerStage) {
        update({ careerStage: reached })
        const newFighters = FIGHTERS.filter((f) => f.unlock.type === "career" && f.unlock.stage === reached).map((f) => f.name)
        const parts = []
        if (reached === CAREER.length) parts.push("You are the Champion of Lagos!")
        if (newFighters.length) parts.push(`${newFighters.join(", ")} unlocked as ${newFighters.length > 1 ? "fighters" : "a fighter"}!`)
        if (parts.length) setUnlockedText(parts.join(" "))
      }
    }

    if (fight.kind === "daily") {
      if (r.won) update((p) => ({ dailyWins: p.dailyWins + 1 }))
      if (!dailyBest || r.score > dailyBest) update({ dailyBest: { key: daily.key, score: r.score } })
      if (status !== "ready") {
        setScoreStatus({ state: "error", message: "Play inside Lagos Life to post scores." })
        return
      }
      setScoreStatus({ state: "sending" })
      const s = await submitScore(r.score)
      if (s.ok) setScoreStatus({ state: "sent", message: `Posted! Your best: ${s.best.toLocaleString()}` })
      else setScoreStatus({ state: "error", message: friendlyError(s.code) })
    }
  }

  function openSelect(from: Screen) {
    setSelectReturn(from)
    setScreen("select")
  }

  const menu = () => {
    stopLinks()
    setDetourFrom(null)
    setScreen("menu")
  }

  function detour(to: Screen) {
    setDetourFrom(screen)
    setScreen(to)
  }

  const back = () => {
    if (!detourFrom) return menu()
    setScreen(detourFrom)
    setDetourFrom(null)
  }

  function quitFight() {
    if (!fight) return menu()
    if (fight.kind === "pvp") {
      update((p) => ({ pvp: { ...p.pvp, losses: p.pvp.losses + 1 } }))
      fight.link?.stop()
      return setScreen("versus")
    }
    if (fight.kind === "watch") {
      stopLinks()
      return setScreen("live")
    }
    setScreen(fight.kind === "daily" ? "daily" : "career")
  }

  const setCustom = (c: Custom | undefined) =>
    update((p) => {
      const next = { ...p.custom }
      if (c) next[fighter.id] = c
      else delete next[fighter.id]
      return { custom: next }
    })

  let content: React.ReactNode
  switch (screen) {
    case "career":
      content = (
        <CareerScreen
          careerStage={progress.careerStage}
          fighter={fighter}
          difficulty={progress.difficulty}
          onDifficulty={(d) => update({ difficulty: d })}
          onBack={menu}
          onChangeFighter={() => openSelect("career")}
          onFight={(i) => openLocker("career", i, "career")}
        />
      )
      break
    case "daily":
      content = (
        <DailyScreen
          opponent={daily.opponent}
          fighter={fighter}
          best={dailyBest}
          onBack={menu}
          onFight={() => openLocker("daily", 0, "daily")}
          onChangeFighter={() => openSelect("daily")}
        />
      )
      break
    case "select":
      content = (
        <FighterSelect
          selectedId={fighter.id}
          careerStage={progress.careerStage}
          owns={owns}
          onBack={() => setScreen(selectReturn)}
          onSelect={(id) => {
            update({ fighterId: id })
            setScreen(selectReturn)
          }}
          onShop={() => setScreen("shop")}
        />
      )
      break
    case "studio":
      content = (
        <StudioScreen
          fighter={fighter}
          custom={myCustom}
          belts={progress.belts}
          onChange={setCustom}
          onBack={back}
          onChangeFighter={() => openSelect("studio")}
        />
      )
      break
    case "belts":
      content = <BeltsScreen held={progress.belts} onBack={menu} />
      break
    case "versus":
      content = (
        <VersusScreen
          fighter={fighter}
          loadout={{ fighterId: fighter.id, custom: myCustom, belt: myBelt }}
          record={progress.pvp}
          onStart={startOnline}
          onBack={menu}
          onChangeFighter={() => openSelect("versus")}
        />
      )
      break
    case "live":
      content = <LiveScreen onWatch={startWatching} onBack={menu} onFight={() => setScreen("versus")} />
      break
    case "connecting":
      content = (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="font-display text-3xl uppercase text-primary">Taking your seat…</p>
          <button type="button" onClick={() => quitFight()} className="rounded-full bg-secondary px-6 py-2.5 font-display uppercase">
            Back
          </button>
        </div>
      )
      break
    case "locker":
      if (!locker) {
        content = null
        break
      }
      content = (
        <LockerScreen
          fighter={fighter}
          opponent={fightOpponent(locker.kind, locker.stage)}
          subtitle={locker.kind === "daily" ? "Daily Knockout" : `Career · Fight ${locker.stage + 1} of ${CAREER.length}`}
          careerStage={progress.careerStage}
          coachId={coach.id}
          perksOn={locker.kind === "career"}
          cosmetics={cosmetics}
          custom={myCustom}
          belts={progress.belts}
          onCoach={(id) => update({ coachId: id })}
          onWalkOut={() => startFight(locker.kind, locker.stage)}
          onBack={() => setScreen(locker.from)}
          onChangeFighter={() => openSelect("locker")}
          onStudio={() => detour("studio")}
          onShop={() => detour("shop")}
        />
      )
      break
    case "shop":
      content = <ShopScreen onBack={back} />
      break
    case "leaderboard":
      content = <LeaderboardScreen onBack={menu} />
      break
    case "fight":
      content = fight && (
        <FightScreen
          key={fight.nonce}
          config={fight.config}
          showTutorial={!progress.tutorialSeen}
          onTutorialDone={() => update({ tutorialSeen: true })}
          onEnd={onFightEnd}
          onQuit={quitFight}
          watchMatchId={fight.kind === "watch" ? fight.matchId : undefined}
          viewerName={player?.name}
        />
      )
      break
    case "results": {
      if (!fight || !result) {
        content = null
        break
      }
      const online = fight.kind === "pvp" || fight.kind === "watch"
      const hasNext = fight.kind === "career" && result.won && fight.stage + 1 < CAREER.length
      const watchTitle = fight.kind === "watch" ? `${result.won ? fight.config.playerName : fight.config.oppName} wins` : undefined
      content = (
        <ResultsScreen
          result={result}
          oppName={fight.config.oppName ?? fight.opponent.name}
          daily={fight.kind === "daily"}
          unlockedText={unlockedText}
          scoreStatus={scoreStatus}
          newBelts={newBelts}
          title={watchTitle}
          primaryLabel={
            hasNext ? "Next fight" : fight.kind === "daily" ? "Leaderboard" : fight.kind === "pvp" ? "Fight again" : fight.kind === "watch" ? "Watch more" : null
          }
          onPrimary={() =>
            hasNext
              ? openLocker("career", fight.stage + 1, "career")
              : fight.kind === "pvp"
                ? setScreen("versus")
                : fight.kind === "watch"
                  ? setScreen("live")
                  : setScreen("leaderboard")
          }
          onRetry={() => (online ? setScreen(fight.kind === "pvp" ? "versus" : "live") : startFight(fight.kind as "career" | "daily", fight.stage))}
          onMenu={menu}
        />
      )
      break
    }
    default:
      content = (
        <MenuScreen
          careerStage={progress.careerStage}
          muted={progress.muted}
          onToggleMute={() => {
            audio.setMuted(!progress.muted)
            update({ muted: !progress.muted })
          }}
          onNavigate={(to) => (to === "select" ? openSelect("menu") : setScreen(to))}
        />
      )
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background" onPointerDownCapture={() => audio.unlock()}>
      {content}
    </main>
  )
}
