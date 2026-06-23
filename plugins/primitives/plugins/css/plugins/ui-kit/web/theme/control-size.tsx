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

/**
 * Marker contract for a density-participating control: it derives its size from
 * ambient `ControlSize` (via `useControlSize`), so it must NOT accept a
 * per-instance `size`. Intersect a primitive's props with this (or
 * `extends DensityControlled` for an interface) instead of hand-writing
 * `size?: never`, so the "no size prop" contract has ONE home. Enforced at call
 * sites by the `control-size/no-adhoc-density` lint rule.
 */
export type DensityControlled = { size?: never }

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

/**
 * THE single density→text-step policy — the one threshold consumed by `Button`,
 * `Badge`, AND `Text`, so a row of mixed leaves can never desync its type rung.
 * `xs` drops exactly one type rung; `sm`/`md`/`lg` keep the comfortable size
 * (type tracks content density, not chrome affordance — toolbars/headers default
 * to `sm` and must stay legible). A future change to where text steps is a single
 * edit here.
 */
export function textStepFor(density: ControlSize): 0 | 1 {
  return density === "xs" ? 1 : 0
}

/**
 * `Button`'s own text rungs (body size; the cva still supplies `font-medium`),
 * driven by the shared step. The raw `text-sm`/`text-xs` strings are intentional
 * here — `ui-kit` is the sanctioned home for raw size mechanics and the
 * `no-adhoc-typography` lint never follows a call result into its function body.
 */
export function buttonTextClassFor(density: ControlSize): string {
  return textStepFor(density) ? "text-xs" : "text-sm"
}
