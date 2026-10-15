"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Loader2, Swords, Users, Zap } from "lucide-react"
import { useVatar } from "@/components/vatar/vatar-provider"
import type { FighterDef } from "@/lib/game/fighters"
import { FightLink, joinGuestMatch, joinVatarMatch } from "@/lib/pvp/client"
import type { Loadout } from "@/lib/pvp/types"
import { errorCode, friendlyError, type VatarMatch } from "@/lib/vatar/types"
import { ScreenShell } from "./screen-shell"

type State =
  | { kind: "idle" }
  | { kind: "busy"; msg: string }
  | { kind: "waiting"; code: string | null }
  | { kind: "error"; msg: string }

export function VersusScreen({
  fighter,
  loadout,
  record,
  onStart,
  onBack,
  onChangeFighter,
}: {
  fighter: FighterDef
  loadout: Omit<Loadout, "name">
  record: { wins: number; losses: number }
  onStart: (link: FightLink, opp: Loadout, myName: string) => void
  onBack: () => void
  onChangeFighter: () => void
}) {
  const { matchApi, session, player, status } = useVatar()
  const [state, setState] = useState<State>({ kind: "idle" })
  const [code, setCode] = useState("")
  const linkRef = useRef<FightLink | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const startedRef = useRef(false)
  const usedVatar = useRef(false)
  const myName = player?.name ?? "Guest"

  useEffect(() => {
    return () => {
      unsubRef.current?.()
      if (!startedRef.current) {
        linkRef.current?.stop()
        if (usedVatar.current) void matchApi?.leave().catch(() => {})
      }
    }
  }, [matchApi])

  function attach(link: FightLink) {
    linkRef.current = link
    const check = () => {
      if (startedRef.current) return
      if (link.startAt && link.opp) {
        startedRef.current = true
        unsubRef.current?.()
        onStart(link, link.opp, myName)
      } else setState({ kind: "waiting", code: link.code })
    }
    link.onChange = check
    check()
  }

  async function connectVatar(m: VatarMatch) {
    if (linkRef.current) return
    setState({ kind: "busy", msg: "Opponent found. Getting in the ring…" })
    const s = await session()
    if (!s) return setState({ kind: "error", msg: friendlyError("sdk_unavailable") })
    const r = await joinVatarMatch(s, m.id, loadout)
    if (!r.ok) return setState({ kind: "error", msg: friendlyError(r.code) })
    attach(new FightLink(r.data))
  }

  async function viaGuest(how: "quick" | "create" | "join") {
    setState({ kind: "busy", msg: how === "quick" ? "Looking for an opponent…" : how === "create" ? "Setting up your fight…" : "Joining…" })
    const r = await joinGuestMatch(how === "quick" ? { quick: true } : how === "create" ? { create: true } : { code: code.trim().toUpperCase() }, myName, loadout)
    if (!r.ok) return setState({ kind: "error", msg: friendlyError(r.code) })
    attach(new FightLink(r.data))
  }

  async function go(how: "quick" | "create" | "join") {
    if (how === "join" && !/^[A-Za-z]{6}$/.test(code.trim())) return setState({ kind: "error", msg: "Codes are six letters." })
    if (!matchApi) return viaGuest(how)
    setState({ kind: "busy", msg: how === "quick" ? "Looking for an opponent…" : how === "create" ? "Setting up your fight…" : "Joining…" })
    try {
      // Friendlies only: no stakes, so no game money changes hands.
      const m =
        how === "quick" ? await matchApi.quick({ stake: 0 }) : how === "create" ? await matchApi.create({ stake: 0, seats: 2 }) : await matchApi.join(code.trim().toUpperCase())
      usedVatar.current = true
      setState({ kind: "waiting", code: m.code })
      unsubRef.current = matchApi.onUpdate((u) => {
        if (u.status === "playing") void connectVatar(u)
        else if (u.status === "cancelled" || u.status === "void") setState({ kind: "error", msg: "The match was cancelled." })
      })
      if (m.status === "playing") void connectVatar(m)
    } catch (err) {
      const c = errorCode(err)
      if (c === "not_available") return viaGuest(how)
      setState({ kind: "error", msg: friendlyError(c) })
    }
  }

  function cancel() {
    unsubRef.current?.()
    linkRef.current?.stop()
    linkRef.current = null
    if (usedVatar.current) void matchApi?.leave().catch(() => {})
    usedVatar.current = false
    setState({ kind: "idle" })
  }

  const busy = state.kind === "busy" || state.kind === "waiting"

  return (
    <ScreenShell title="Online fight" onBack={onBack}>
      <button
        type="button"
        onClick={onChangeFighter}
        disabled={busy}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left ring-1 ring-border active:scale-[0.99] disabled:opacity-60"
      >
        <span className="flex-1">
          <span className="block text-xs text-muted-foreground">Fighting as {myName}</span>
          <span className="block font-display text-xl uppercase">{fighter.name}</span>
        </span>
        <span className="text-right text-xs text-muted-foreground">
          {record.wins}W · {record.losses}L
        </span>
      </button>

      {state.kind === "waiting" || state.kind === "busy" ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-6 text-center ring-1 ring-border" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          {state.kind === "waiting" ? (
            <>
              <p className="font-display text-xl uppercase">Waiting for your opponent</p>
              {state.code && (
                <>
                  <p className="text-sm text-muted-foreground">Share this code with a friend:</p>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(state.code ?? "").catch(() => {})}
                    className="flex items-center gap-2 rounded-xl bg-secondary px-5 py-3 font-display text-4xl tracking-[0.3em]"
                    aria-label={`Copy code ${state.code}`}
                  >
                    {state.code}
                    <Copy className="size-5" aria-hidden />
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="font-display text-xl uppercase">{state.msg}</p>
          )}
          <button type="button" onClick={cancel} className="rounded-full bg-secondary px-6 py-2.5 font-display uppercase">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void go("quick")}
            className="flex items-center gap-4 rounded-2xl bg-primary p-4 text-left text-primary-foreground shadow-[0_6px_0_#a07f00] active:translate-y-1 active:shadow-[0_2px_0_#a07f00]"
          >
            <Zap className="size-8 shrink-0" aria-hidden />
            <span>
              <span className="block font-display text-2xl uppercase">Quick match</span>
              <span className="block text-sm opacity-80">Fight whoever is waiting</span>
            </span>
          </button>
          <button type="button" onClick={() => void go("create")} className="flex items-center gap-4 rounded-2xl bg-card p-4 text-left ring-1 ring-border active:scale-[0.99]">
            <Users className="size-7 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-display text-xl uppercase">Challenge a friend</span>
              <span className="block text-sm text-muted-foreground">Get a code to share</span>
            </span>
          </button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void go("join")
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 6).toUpperCase())}
              placeholder="CODE"
              inputMode="text"
              autoCapitalize="characters"
              aria-label="Friend's six-letter code"
              className="min-w-0 flex-1 rounded-2xl bg-card px-4 font-display text-2xl tracking-[0.3em] ring-1 ring-border outline-none focus:ring-primary"
            />
            <button type="submit" className="flex items-center gap-2 rounded-2xl bg-secondary px-5 py-3 font-display text-lg uppercase active:scale-95">
              <Swords className="size-5" aria-hidden />
              Join
            </button>
          </form>
          {state.kind === "error" && (
            <p className="rounded-xl bg-accent/15 px-3 py-2 text-sm text-accent" role="alert">
              {state.msg}
            </p>
          )}
          <div className="mt-2 rounded-2xl bg-card p-4 text-sm ring-1 ring-border">
            <p className="font-display uppercase text-primary">How online fights work</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Your punch winds up when you tap and lands on the next beat. Your opponent sees it coming, and so do you.</li>
              <li>Dodge, block or side-step before it lands. Your superpower charges for a beat, so watch for the glow.</li>
              <li>Friendly fights only: no game money is staked. Wins count towards online belts.</li>
              {status !== "ready" && <li>Outside Lagos Life you fight as a guest.</li>}
            </ul>
          </div>
        </div>
      )}
    </ScreenShell>
  )
}
