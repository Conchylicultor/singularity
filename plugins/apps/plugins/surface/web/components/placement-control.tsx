import { useMemo } from "react";
import {
  useFocusedPlacement,
  setFocusedTabPlacement,
} from "@plugins/apps/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { Surface } from "../slots";

/**
 * Placement control contributed into `ActionBar.Item`. Provider-free: it reads
 * the focused tab's placement from the module-level focused-placement store
 * (`useFocusedPlacement`) and drives it via `setFocusedTabPlacement`, so it
 * renders correctly both inside `TabsProvider` (the docked tab-bar strip) and
 * outside it (the globally-mounted floating overlay).
 *
 * The options are derived from the `Surface.Placement` registry (sorted by
 * `order`) — never a hardcoded list — so adding / removing a placement
 * sub-plugin updates the control with zero edits here. With no placements
 * contributed it renders nothing.
 */
export function ActionBarPlacementControl() {
  const defs = Surface.Placement.useContributions();
  const options = useMemo(
    () =>
      [...defs]
        .sort((a, b) => a.order - b.order)
        .map((d) => ({ id: d.id, label: "", icon: <d.icon />, title: d.label })),
    [defs],
  );
  const placement = useFocusedPlacement();
  if (options.length === 0) return null;
  return (
    <SegmentedControl<string>
      options={options}
      value={placement}
      onChange={setFocusedTabPlacement}
      variant="ghost"
    />
  );
}
