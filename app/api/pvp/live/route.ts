import { json, notConfigured } from "@/lib/pvp/http"
import { liveMatches } from "@/lib/pvp/store"

export const dynamic = "force-dynamic"

/** GET: online fights happening now, for the Watch Live gallery. */
export async function GET() {
  const nc = notConfigured()
  if (nc) return nc
  try {
    return json(200, { matches: await liveMatches(), serverNow: Date.now() })
  } catch {
    return json(502, { code: "store_failed" })
  }
}
