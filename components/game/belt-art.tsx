import type { BeltDef } from "@/lib/game/belts"
import { cn } from "@/lib/utils"

/** A championship belt drawn in SVG: strap, side plates and a big centre plate with a star. */
export function BeltArt({ belt, earned, className }: { belt: BeltDef; earned: boolean; className?: string }) {
  const id = `g-${belt.id}`
  return (
    <svg viewBox="0 0 200 80" className={cn("h-auto w-full", !earned && "opacity-35 grayscale", className)} aria-hidden>
      <defs>
        <radialGradient id={id} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="35%" stopColor={belt.plate} />
          <stop offset="100%" stopColor="#5a4320" />
        </radialGradient>
      </defs>
      <rect x="4" y="26" width="192" height="28" rx="8" fill={belt.strap} />
      <rect x="4" y="29" width="192" height="3" fill="#ffffff" opacity="0.15" />
      {[30, 170].map((cx) => (
        <rect key={cx} x={cx - 14} y="24" width="28" height="32" rx="6" fill={`url(#${id})`} stroke="#14101f" strokeWidth="2" />
      ))}
      {[58, 142].map((cx) => (
        <rect key={cx} x={cx - 10} y="27" width="20" height="26" rx="5" fill={`url(#${id})`} stroke="#14101f" strokeWidth="2" />
      ))}
      <ellipse cx="100" cy="40" rx="34" ry="36" fill={`url(#${id})`} stroke="#14101f" strokeWidth="3" />
      <ellipse cx="100" cy="40" rx="24" ry="26" fill="none" stroke="#14101f" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M100 22 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1z" fill="#ff4d3d" stroke="#14101f" strokeWidth="1.5" />
    </svg>
  )
}
