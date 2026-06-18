import { createContext, useContext, useMemo, type ReactNode } from "react"

/** A bag of `data-*` attributes to re-stamp onto portaled content.
 *
 *  Portals relocate their subtree to `document.body`, severing it from the DOM
 *  ancestry that carries ancestry-derived signals — the scoped theme, the plugin
 *  contribution lineage the element-picker reads off marker spans, the containing
 *  pane id. Each such signal is lost the moment content portals out. The fix is
 *  one bridge: a signal flows across the portal as React **context** (which
 *  crosses portals, unlike DOM ancestry) and every portal surface re-stamps the
 *  whole bag back onto its positioner so DOM-walking consumers see it again.
 *
 *  This is the generic substrate. Contributors register one attribute via
 *  {@link PortalForwardProvider}; portal surfaces consume the merged map via
 *  {@link usePortalForwardedAttrs}. Neither side knows about the other, so a new
 *  forwarded signal is a single provider and **zero** portal-surface edits — the
 *  collection/consumer split that keeps "portals sever ancestry" from being a
 *  bug re-fixed once per signal. Theme scope and plugin lineage are the first two
 *  contributors. */
export type PortalForwardedAttrs = Record<string, string>

const PortalForwardContext = createContext<PortalForwardedAttrs>({})

/** The merged `data-*` attributes to spread onto a portaled positioner/root. */
export function usePortalForwardedAttrs(): PortalForwardedAttrs {
  return useContext(PortalForwardContext)
}

/** Register one forwarded `data-*` attribute for portaled descendants. Merges
 *  into the inherited bag (nearest provider wins per key); an `undefined` value
 *  is a no-op so callers forward conditionally without branching. */
export function PortalForwardProvider({
  name,
  value,
  children,
}: {
  name: string
  value: string | undefined
  children: ReactNode
}) {
  const parent = useContext(PortalForwardContext)
  const merged = useMemo(
    () => (value === undefined ? parent : { ...parent, [name]: value }),
    [parent, name, value],
  )
  return (
    <PortalForwardContext.Provider value={merged}>
      {children}
    </PortalForwardContext.Provider>
  )
}
