import { createContext, useContext } from "react";

/**
 * Single source of truth for whether a section's user-text turn is expanded.
 * Owned by `StickyUserHeader` (which both drops its stickiness and feeds this
 * value down to the turn's controlled `Expandable`), so the same fact drives
 * the header chrome and the clamp without a mirrored copy that could desync.
 */
export interface SectionExpand {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
}

const SectionExpandContext = createContext<SectionExpand>({
  expanded: false,
  setExpanded: () => {},
});

export const SectionExpandProvider = SectionExpandContext.Provider;
export const useSectionExpand = () => useContext(SectionExpandContext);
