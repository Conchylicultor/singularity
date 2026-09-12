import { createContext, useContext, useMemo, type ReactNode } from "react";

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
export type PortalForwardedAttrs = Record<string, string>;

/** The two bags a portal can re-stamp. They differ only by the values
 *  registered `regionOnly`: `region` has them, `popup` keeps the value from
 *  above instead. */
interface ForwardedBags {
  region: PortalForwardedAttrs;
  popup: PortalForwardedAttrs;
}

const PortalForwardContext = createContext<ForwardedBags>({
  region: {},
  popup: {},
});

/** The merged `data-*` attributes a POPUP re-stamps onto its portaled
 *  positioner/root — a popover, menu, dialog, tooltip or overlay opened from
 *  here. A value registered `regionOnly` is not in it: a popup is not part of
 *  the region it was opened from. */
export function usePortalForwardedAttrs(): PortalForwardedAttrs {
  return useContext(PortalForwardContext).popup;
}

/** The merged `data-*` attributes for content that is portaled but still part
 *  of this region — an adaptive bar's item, which renders through a portal
 *  whether it sits in the bar or in its overflow panel. Includes every
 *  `regionOnly` value. */
export function useRegionForwardedAttrs(): PortalForwardedAttrs {
  return useContext(PortalForwardContext).region;
}

/** Register one forwarded `data-*` attribute for portaled descendants. Merges
 *  into the inherited bag (nearest provider wins per key); an `undefined` value
 *  is a no-op so callers forward conditionally without branching.
 *
 *  `regionOnly`: the value holds for this region only. Content relocated within
 *  the region keeps it; a popup opened from inside keeps the value from above.
 *  A theme sub-theme is the case — it restyles a page, not the menus opened
 *  from it. */
export function PortalForwardProvider({
  name,
  value,
  regionOnly = false,
  children,
}: {
  name: string;
  value: string | undefined;
  regionOnly?: boolean;
  children: ReactNode;
}) {
  const parent = useContext(PortalForwardContext);
  const merged = useMemo(() => {
    if (value === undefined) return parent;
    return {
      region: { ...parent.region, [name]: value },
      popup: regionOnly ? parent.popup : { ...parent.popup, [name]: value },
    };
  }, [parent, name, value, regionOnly]);
  return (
    <PortalForwardContext.Provider value={merged}>
      {children}
    </PortalForwardContext.Provider>
  );
}
