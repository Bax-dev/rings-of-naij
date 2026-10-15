export interface VatarPlayer {
  id: string
  name: string
  avatar: string | null
}

export interface VatarPurchase {
  purchaseId: string
  productId: string
}

export interface VatarLeaderboard {
  top: { rank: number; name: string; score: number }[]
  me: { rank: number | null; label: string; score: number } | null
}

export interface VatarMatch {
  id: string
  code: string
  status: "open" | "playing" | "done" | "cancelled" | "void"
  stake: number
  seats: number
  players: { id: string; name: string }[]
  me: string
  winner: string | null
  mode: "live" | "test"
}

export interface VatarMatchApi {
  create(opts: { stake: number; seats: number }): Promise<VatarMatch>
  join(code: string): Promise<VatarMatch>
  quick(opts: { stake: number }): Promise<VatarMatch>
  current(): Promise<VatarMatch | null>
  leave(): Promise<VatarMatch | null>
  onUpdate(fn: (m: VatarMatch) => void): () => void
}

export interface VatarSDK {
  match?: VatarMatchApi
  init(): Promise<{ player: VatarPlayer; session: string; mode: "live" | "test" }>
  session(): Promise<{ session: string; exp: number }>
  purchase(productId: string): Promise<VatarPurchase>
  onPurchase(fn: (p: VatarPurchase) => void): () => void
  purchases(): Promise<VatarPurchase[]>
  submitScore(n: number): Promise<{ best: number; accepted: boolean }>
  leaderboard(): Promise<VatarLeaderboard>
  onPause(fn: () => void): () => void
  onResume(fn: () => void): () => void
}

declare global {
  interface Window {
    Vatar?: VatarSDK
  }
}

export function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code
  }
  return "unknown"
}

const MESSAGES: Record<string, string> = {
  not_framed: "Open Ring of Lagos from the Lagos Life Games app to use the shop and leaderboard.",
  sdk_unavailable: "Couldn't reach Lagos Life. Check your connection and try again.",
  cancelled: "Purchase cancelled. No money was taken.",
  payment_failed: "The payment didn't go through. No item was given, and you can try again.",
  owned: "You already own this. Restoring it now.",
  not_for_sale: "This item isn't on sale right now.",
  busy: "A payment sheet is already open.",
  rate_limited: "Too many tries. Wait a few seconds and try again.",
  too_soon: "Score saved locally. The leaderboard takes one score every 20 seconds.",
  not_available: "Online matches aren't switched on for this game yet.",
  no_match: "No fight found with that code.",
  full: "That fight is already full.",
  guests_off: "Open Ring of Lagos inside Lagos Life to fight online.",
  not_configured: "Online fights aren't set up on this server yet.",
  offline: "Couldn't reach the server. Check your connection.",
  claim_failed: "Payment received, but we couldn't unlock it yet. It will retry next time you open the game.",
}

export function friendlyError(code: string) {
  return MESSAGES[code] ?? "Something went wrong. Please try again."
}
