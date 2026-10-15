"use client"

import { useState } from "react"
import { Check, Drum, Loader2, Shirt, Sparkles, Ticket, UserPlus } from "lucide-react"
import { useVatar } from "@/components/vatar/vatar-provider"
import { PRODUCTS, formatNaira, hasItem, type Product } from "@/lib/products"
import { friendlyError } from "@/lib/vatar/types"
import { cn } from "@/lib/utils"
import { ScreenShell } from "./screen-shell"

const ICONS: Record<Product["kind"], typeof Shirt> = { skin: Shirt, fighter: UserPlus, entrance: Drum, pass: Ticket }

export function ShopScreen({ onBack }: { onBack: () => void }) {
  const { status, owned, buy, restore } = useVatar()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null)
  const canBuy = status === "ready"

  async function onBuy(p: Product) {
    if (busyId) return
    setBusyId(p.id)
    setMessage(null)
    const r = await buy(p.id)
    setBusyId(null)
    if (r.ok) setMessage({ text: `${p.name} unlocked. Enjoy!`, tone: "ok" })
    else setMessage({ text: friendlyError(r.code), tone: r.code === "cancelled" || r.code === "owned" ? "ok" : "err" })
  }

  return (
    <ScreenShell title="Shop" onBack={onBack}>
      <p className="mb-4 text-sm text-muted-foreground">
        Every item is looks or an extra fighter. Nothing makes punches stronger, so it is always a fair fight.
      </p>

      {!canBuy && (
        <p className="mb-4 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          {status === "loading" ? "Connecting to Lagos Life…" : friendlyError("not_framed")}
        </p>
      )}

      {message && (
        <p
          className={cn("mb-4 rounded-xl p-3 text-sm font-medium", message.tone === "ok" ? "bg-success/15 text-success" : "bg-accent/15 text-accent")}
          role="status"
        >
          {message.text}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {PRODUCTS.map((p) => {
          const Icon = ICONS[p.kind]
          const isOwned = hasItem(owned, p.id)
          const busy = busyId === p.id
          return (
            <li key={p.id} className={cn("flex items-center gap-3 rounded-2xl bg-card p-3 ring-1", p.kind === "pass" ? "ring-primary" : "ring-border")}>
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", p.kind === "pass" ? "bg-primary text-primary-foreground" : "bg-secondary text-primary")}>
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-display text-lg uppercase leading-tight">
                  {p.name}
                  {p.kind === "pass" && <Sparkles className="size-4 text-primary" aria-hidden />}
                </span>
                <span className="block text-xs text-muted-foreground">{p.description}</span>
              </span>
              {isOwned ? (
                <span className="flex items-center gap-1 rounded-full bg-success/15 px-3 py-2 text-sm font-bold text-success">
                  <Check className="size-4" aria-hidden /> Owned
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canBuy || !!busyId}
                  onClick={() => onBuy(p)}
                  className="min-w-20 rounded-full bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40 active:scale-95"
                  aria-label={`Buy ${p.name} for ${formatNaira(p.price)}`}
                >
                  {busy ? <Loader2 className="mx-auto size-4 animate-spin" aria-label="Waiting for payment" /> : formatNaira(p.price)}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {canBuy && (
        <button type="button" onClick={() => void restore()} className="mt-5 w-full py-3 text-sm text-muted-foreground underline underline-offset-4">
          Restore purchases
        </button>
      )}
    </ScreenShell>
  )
}
