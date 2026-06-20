import { createContext, useContext, type ReactNode } from "react"

/**
 * Whether the surrounding region is **single-line by contract** — the ambient
 * twin of `ControlSize`, and the second half of the single-line guarantee.
 *
 * Whether text wraps is NOT a property of the text: the same `<Text>` is correct
 * in a paragraph and broken in a chrome row. It is a property of WHERE the text
 * lives, owned by the container. Containers come in two kinds:
 *
 * - **Line containers** (`Frame`, `Row`, `Bar`, collapsible headers) — single-line
 *   by contract. They provide `true`, so every `<Text>` leaf inside ellipsizes.
 * - **Flow containers** (`Stack`, `Column`, and the `Cluster`/`Inline` that
 *   delegate to `Stack`) — multi-line OK. They RESET to `false`, so a flow region
 *   nested inside a line container lets its text wrap again.
 *
 * This is the ellipsis-polish layer (the leaf reads it and truncates). It rides
 * ALONGSIDE the structural CSS layer: a line container also sets
 * `whitespace-nowrap` (via `region-line`) on its root, which stops ALL descendant
 * text — `<Text>`, a raw string, an inline chip — from wrapping. The two layers
 * mirror the existing `region-line` + truncation-leaf split.
 *
 * Lives in ui-kit (the ambient kit, beside `control-size.tsx`) so the foundational
 * `Text` leaf reads it without inverting layers — exactly the placement rationale
 * `ControlSize` uses to sit beside `Button`.
 */
const SingleLineContext = createContext<boolean>(false)

/**
 * Declares whether everything inside is single-line. Line containers wrap their
 * children in `value={true}`; flow containers reset with `value={false}`
 * (innermost wins). No logic — a bare Provider, like `ControlSizeProvider`.
 */
export function SingleLineProvider({
  value,
  children,
}: {
  value: boolean
  children: ReactNode
}) {
  return (
    <SingleLineContext.Provider value={value}>
      {children}
    </SingleLineContext.Provider>
  )
}

/** Reads the ambient single-line contract. Defaults to `false` (flow) outside any provider. */
export function useSingleLine(): boolean {
  return useContext(SingleLineContext)
}
