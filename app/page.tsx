import { GameApp } from "@/components/game/game-app"
import { VatarProvider } from "@/components/vatar/vatar-provider"

export default function Page() {
  return (
    <VatarProvider>
      <GameApp />
    </VatarProvider>
  )
}
