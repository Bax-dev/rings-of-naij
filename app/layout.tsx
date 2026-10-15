import type { Metadata, Viewport } from "next"
import { Anton, Space_Grotesk } from "next/font/google"
import Script from "next/script"
import "./globals.css"

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" })
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap" })

export const metadata: Metadata = {
  title: "Ring of Lagos",
  description: "Rhythm boxing on Lagos streets: hit on the beat, build your vibe and become Champion of Lagos.",
  icons: { icon: "/icon-512.png", apple: "/icon-512.png" },
  appleWebApp: { capable: true, title: "Ring of Lagos", statusBarStyle: "black-translucent" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#14101f",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${anton.variable} ${space.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Script src="https://lagoslife.app/sdk/vatar-games-v1.js" strategy="afterInteractive" />
      </body>
    </html>
  )
}
