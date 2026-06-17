import { createContext, useContext, type ReactNode } from "react"

/**
 * The density of an interactive control — the single axis a toolbar/slot owns.
 * Each control maps this to its OWN shape bundle (text → `control-sm`, icon →
 * `control-icon-sm`, chip → its `sm`), so a row of mixed controls snaps to one
 * height while keeping their shapes. This is why density is a named token, not a
 * CSS height var: the size is a bundle (height + padding + radius + text + gap +
 * icon), and each control resolves its own bundle from the shared density name.
 *
 * Lives in web-core (the ambient ui-kit, co-located with `button.tsx` and
 * `control-utilities.ts`) — NOT in the `control-size` primitive — so the
 * foundational `Button` reads it without inverting layers (the same placement
 * rationale as the icon-auto `control-utilities` mirror).
 */
export type ControlSize = "xs" | "sm" | "md" | "lg"

/** The `Button` cva size tokens for the square icon-shape, per density. */
export type ButtonIconSize = "icon-xs" | "icon-sm" | "icon" | "icon-lg"

const ControlSizeContext = createContext<ControlSize>("md")

/**
 * Declares the control density for everything inside. A size-owning slot wraps
 * its contributions in this (see slot-render's `controlSize` config); any host
 * may also wrap manually to override (innermost wins).
 */
export function ControlSizeProvider({
  size,
  children,
}: {
  size: ControlSize
  children: ReactNode
}) {
  return (
    <ControlSizeContext.Provider value={size}>
      {children}
    </ControlSizeContext.Provider>
  )
}

/** Reads the ambient control density. Defaults to `"md"` outside any provider. */
export function useControlSize(): ControlSize {
  return useContext(ControlSizeContext)
}

/** Density → the `Button` icon-shape cva token (`md` → `"icon"`). */
export function iconSizeFor(size: ControlSize): ButtonIconSize {
  switch (size) {
    case "xs":
      return "icon-xs"
    case "sm":
      return "icon-sm"
    case "md":
      return "icon"
    case "lg":
      return "icon-lg"
  }
}

/** Density → the `Button` text-shape cva token (identity; kept as the one mapping seam). */
export function textSizeFor(size: ControlSize): ControlSize {
  return size
}
