"use client"

import { useEffect, useState } from "react"
import { Maximize, Minimize } from "lucide-react"
import { cn } from "@/lib/utils"

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void }
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void }

function fullscreenElement() {
  const d = document as FsDocument
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

/** Toggles browser fullscreen. Renders nothing where the API is missing (iPhone Safari, iframes without allow="fullscreen"). */
export function FullscreenButton({ className }: { className?: string }) {
  const [supported, setSupported] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const d = document as FsDocument
    setSupported(!!(d.fullscreenEnabled || d.webkitFullscreenEnabled))
    const sync = () => setActive(!!fullscreenElement())
    sync()
    document.addEventListener("fullscreenchange", sync)
    document.addEventListener("webkitfullscreenchange", sync)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      document.removeEventListener("webkitfullscreenchange", sync)
    }
  }, [])

  if (!supported) return null

  function toggle() {
    const d = document as FsDocument
    if (fullscreenElement()) {
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => {})
      else d.webkitExitFullscreen?.()
      return
    }
    const el = document.documentElement as FsElement
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {})
    else el.webkitRequestFullscreen?.()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn("flex size-11 items-center justify-center rounded-full bg-background/70 backdrop-blur active:scale-95", className)}
      aria-label={active ? "Exit fullscreen" : "Go fullscreen"}
    >
      {active ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
    </button>
  )
}
