"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { errorCode, type VatarLeaderboard, type VatarMatchApi, type VatarPlayer, type VatarPurchase, type VatarSDK } from "@/lib/vatar/types"

type Status = "loading" | "ready" | "practice" | "error"

interface VatarContextValue {
  status: Status
  player: VatarPlayer | null
  mode: "live" | "test" | null
  error: string | null
  /** True while the world has paused the game (backgrounded, or the pay sheet is open). */
  paused: boolean
  owned: ReadonlySet<string>
  buy: (productId: string) => Promise<{ ok: true } | { ok: false; code: string }>
  submitScore: (n: number) => Promise<{ ok: true; best: number } | { ok: false; code: string }>
  leaderboard: () => Promise<VatarLeaderboard>
  restore: () => Promise<void>
  /** Vatar's match-making (friendlies only here), or null outside Lagos Life. */
  matchApi: VatarMatchApi | null
  /** A fresh session token for our server, or null outside Lagos Life. */
  session: () => Promise<string | null>
}

const VatarContext = createContext<VatarContextValue | null>(null)

function waitForSdk(timeoutMs = 6000): Promise<VatarSDK> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.Vatar) return resolve(window.Vatar)
      if (Date.now() - started > timeoutMs) return reject(Object.assign(new Error("SDK unavailable"), { code: "sdk_unavailable" }))
      setTimeout(tick, 100)
    }
    tick()
  })
}

// Module-level so React Strict Mode's double effects can never call Vatar.init() twice (limit: 10/min).
let initOnce: Promise<{ sdk: VatarSDK; player: VatarPlayer; mode: "live" | "test" }> | null = null
const pauseListeners = new Set<(paused: boolean) => void>()
const purchaseListeners = new Set<(p: VatarPurchase) => void>()

function initVatar() {
  if (!initOnce) {
    initOnce = waitForSdk().then(async (sdk) => {
      sdk.onPause(() => pauseListeners.forEach((fn) => fn(true)))
      sdk.onResume(() => pauseListeners.forEach((fn) => fn(false)))
      sdk.onPurchase((p) => purchaseListeners.forEach((fn) => fn(p)))
      const { player, mode } = await sdk.init()
      return { sdk, player, mode }
    })
  }
  return initOnce
}

export function VatarProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading")
  const [player, setPlayer] = useState<VatarPlayer | null>(null)
  const [mode, setMode] = useState<"live" | "test" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [owned, setOwned] = useState<ReadonlySet<string>>(new Set())
  const sdkRef = useRef<VatarSDK | null>(null)
  const claiming = useRef(new Set<string>())

  const grant = useCallback((productId: string) => {
    setOwned((prev) => new Set(prev).add(productId))
  }, [])

  const claim = useCallback(
    async (p: VatarPurchase) => {
      const sdk = sdkRef.current
      if (!sdk || claiming.current.has(p.purchaseId)) return false
      claiming.current.add(p.purchaseId)
      try {
        const { session } = await sdk.session()
        const r = await fetch("/api/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session, purchaseId: p.purchaseId }),
        })
        if (!r.ok) return false
        const data = (await r.json()) as { productId: string }
        grant(data.productId)
        return true
      } catch {
        return false
      } finally {
        claiming.current.delete(p.purchaseId)
      }
    },
    [grant],
  )

  const restore = useCallback(async () => {
    const sdk = sdkRef.current
    if (!sdk) return
    // Owned items live on our server (verified + stored per purchaseId), so they follow the player.
    try {
      const { session } = await sdk.session()
      const r = await fetch("/api/owned", { headers: { Authorization: `Bearer ${session}` }, cache: "no-store" })
      if (r.ok) {
        const data = (await r.json()) as { productIds: string[] }
        setOwned((prev) => new Set([...prev, ...data.productIds]))
      }
    } catch {}
    // Anything paid but not yet delivered (crash, reload, closed mid-purchase) is claimed again.
    try {
      const pending = await sdk.purchases()
      await Promise.all(pending.map(claim))
    } catch {}
  }, [claim])

  useEffect(() => {
    let alive = true
    const onPauseChange = (p: boolean) => alive && setPaused(p)
    const onPurchase = (p: VatarPurchase) => void claim(p)
    pauseListeners.add(onPauseChange)
    purchaseListeners.add(onPurchase)

    initVatar()
      .then(({ sdk, player, mode }) => {
        if (!alive) return
        sdkRef.current = sdk
        setPlayer(player)
        setMode(mode)
        setStatus("ready")
        void restore()
      })
      .catch((err) => {
        if (!alive) return
        const code = errorCode(err)
        setError(code)
        setStatus(code === "not_framed" || code === "sdk_unavailable" ? "practice" : "error")
      })

    return () => {
      alive = false
      pauseListeners.delete(onPauseChange)
      purchaseListeners.delete(onPurchase)
    }
  }, [claim, restore])

  const buy = useCallback<VatarContextValue["buy"]>(
    async (productId) => {
      const sdk = sdkRef.current
      if (!sdk) return { ok: false, code: "not_framed" }
      try {
        const p = await sdk.purchase(productId)
        const ok = await claim(p)
        return ok ? { ok: true } : { ok: false, code: "claim_failed" }
      } catch (err) {
        const code = errorCode(err)
        if (code === "owned") void restore()
        return { ok: false, code }
      }
    },
    [claim, restore],
  )

  const submitScore = useCallback<VatarContextValue["submitScore"]>(async (n) => {
    const sdk = sdkRef.current
    if (!sdk) return { ok: false, code: "not_framed" }
    try {
      const r = await sdk.submitScore(Math.max(0, Math.floor(n)))
      return { ok: true, best: r.best }
    } catch (err) {
      return { ok: false, code: errorCode(err) }
    }
  }, [])

  const leaderboard = useCallback(async () => {
    const sdk = sdkRef.current
    if (!sdk) throw Object.assign(new Error("not framed"), { code: "not_framed" })
    return sdk.leaderboard()
  }, [])

  const session = useCallback(async () => {
    const sdk = sdkRef.current
    if (!sdk) return null
    try {
      return (await sdk.session()).session
    } catch {
      return null
    }
  }, [])

  const matchApi = status === "ready" ? (sdkRef.current?.match ?? null) : null

  const value = useMemo(
    () => ({ status, player, mode, error, paused, owned, buy, submitScore, leaderboard, restore, matchApi, session }),
    [status, player, mode, error, paused, owned, buy, submitScore, leaderboard, restore, matchApi, session],
  )

  return <VatarContext.Provider value={value}>{children}</VatarContext.Provider>
}

export function useVatar() {
  const ctx = useContext(VatarContext)
  if (!ctx) throw new Error("useVatar must be used inside <VatarProvider>")
  return ctx
}
