import type { ReactNode } from "react";
import type {
  HostedToolbar,
  HostedToolbarParts,
} from "@plugins/primitives/plugins/data-view/core";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";

/**
 * The conversation sidebar's own header: ONE sticky line — the view switcher
 * as a full-width row (its icon on the rows' lead column, so it reads as the
 * list's heading), then the options trigger (search and every control behind
 * one button, hover-revealed off the DataView root) at the right edge — and
 * the rows below it.
 *
 * A hosted frame rather than a toolbar arrangement because the sidebar is
 * narrow: an arrangement is ignored by the compact fold, which a sidebar is
 * always in, while a hosted frame is the surface's own header in every width.
 *
 * `switcher` is `null` when the surface authors a single view (and while the
 * config loads); the empty `Fill` then still holds the options trigger at the
 * right edge, so the line keeps its shape. `stickyRef` goes on the pinned box
 * so the shell publishes its height and the grouped views' section headers pin
 * BELOW this line instead of sliding under it.
 */
function SidebarFrame({
  switcher,
  options,
  creators,
  body,
  stickyRef,
}: HostedToolbarParts): ReactNode {
  return (
    <>
      <Sticky edge="top" mask layer="nav" ref={stickyRef}>
        <Line className="gap-xs py-2xs rail-follow">
          <Fill>{switcher}</Fill>
          {creators}
          {options}
        </Line>
      </Sticky>
      {body}
    </>
  );
}

/** The sidebar's hosted toolbar: {@link SidebarFrame}, with the switcher built
 *  in its `row` form. Module-scope, so the frame's identity is stable. */
export const SIDEBAR_TOOLBAR: HostedToolbar = {
  kind: "hosted",
  forms: { switcher: "row" },
  frame: SidebarFrame,
};
