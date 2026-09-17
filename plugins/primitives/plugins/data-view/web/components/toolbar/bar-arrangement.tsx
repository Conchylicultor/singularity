import type { ReactNode } from "react";
import type { ToolbarArrangement, ToolbarParts } from "../../../core";

/**
 * The default wide toolbar: one inline row of [title | switcher strip | search |
 * control triggers | actions | creators]. The layout every DataView has always
 * had, moved out of `DataViewToolbar` so it is one arrangement among others
 * rather than the toolbar's only shape.
 */
function BarToolbar({
  title,
  switcher,
  search,
  controls,
  actions,
  creators,
}: ToolbarParts): ReactNode {
  return (
    <div
      // toolbar row of variable-content controls; no named-slot primitive maps. The Sticky's `mask` paints `bg-chrome-mask` so rows don't show through the pinned bar (and it matches whatever surface the DataView is embedded in)
      //
      // ONE line — no `flex-wrap` (the compact fold is the host's answer to a
      // row that does not fit).
      // eslint-disable-next-line layout/no-adhoc-layout
      className="flex items-center gap-sm py-sm rail-follow"
    >
      {title}
      {/* The switcher grows (flex-1) to absorb the leading slack, so it pushes
          search + trailing controls to the right — no `ml-auto` margin needed
          (and an auto margin would steal the free space from the switcher's
          flex-grow, collapsing its hover-reveal spacer). */}
      {switcher.strip}
      {search}
      {controls}
      {/* eslint-disable-next-line row-actions/no-raw-actions-slot -- surface-level toolbar actions, one per DataView, not a per-row cluster */}
      {actions}
      {creators}
    </div>
  );
}

/** The default arrangement — see {@link BarToolbar}. */
export const barArrangement: ToolbarArrangement = {
  id: "bar",
  forms: { search: "field", controls: "ghost", creators: "labelled" },
  component: BarToolbar,
};
