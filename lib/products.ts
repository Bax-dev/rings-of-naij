export interface Product {
  id: string
  name: string
  description: string
  /** Display only. The Vatar pay sheet always shows the real price from Vatar's records. */
  price: number
  kind: "skin" | "fighter" | "entrance" | "pass"
}

export const PRODUCTS: Product[] = [
  { id: "gloves_gold", name: "Gold gloves", description: "Shiny gold gloves skin. Looks only.", price: 100, kind: "skin" },
  { id: "trunks_ankara", name: "Ankara trunks", description: "Bold ankara-print trunks skin. Looks only.", price: 200, kind: "skin" },
  {
    id: "entrance_talkingdrum",
    name: "Talking-drum entrance",
    description: "A talking-drum intro plays before every fight.",
    price: 200,
    kind: "entrance",
  },
  { id: "fighter_amapiano", name: "DJ Amapiano", description: "Unlock the groove builder. Vibe fills faster.", price: 500, kind: "fighter" },
  { id: "fighter_highlife", name: "Baba Highlife", description: "Unlock the veteran counter-puncher.", price: 500, kind: "fighter" },
  {
    id: "season_pass_1",
    name: "Season pass 1",
    description: "Both extra fighters, every skin and the talking-drum entrance.",
    price: 1500,
    kind: "pass",
  },
]

export const PRODUCT_IDS = PRODUCTS.map((p) => p.id)

/** Products that season_pass_1 also grants. */
const PASS_CONTENTS = ["gloves_gold", "trunks_ankara", "entrance_talkingdrum", "fighter_amapiano", "fighter_highlife"]

export function hasItem(owned: ReadonlySet<string>, productId: string) {
  return owned.has(productId) || (owned.has("season_pass_1") && PASS_CONTENTS.includes(productId))
}

export function formatNaira(n: number) {
  return `₦${n.toLocaleString("en-NG")}`
}
