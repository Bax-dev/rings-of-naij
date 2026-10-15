import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ring of Lagos",
    short_name: "Ring of Lagos",
    description: "Rhythm boxing on Lagos streets.",
    start_url: "/",
    display: "fullscreen",
    background_color: "#14101f",
    theme_color: "#14101f",
    icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  }
}
