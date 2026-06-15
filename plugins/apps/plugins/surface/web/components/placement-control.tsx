import { MdViewSidebar, MdWebAsset, MdFullscreen } from "react-icons/md";
import {
  useFocusedPlacement,
  setFocusedTabPlacement,
  type Placement,
} from "@plugins/apps/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";

const OPTIONS = [
  { id: "docked" as const, label: "", icon: <MdViewSidebar />, title: "Dock in tab strip" },
  { id: "floating" as const, label: "", icon: <MdWebAsset />, title: "Float as window" },
  { id: "solo" as const, label: "", icon: <MdFullscreen />, title: "Fullscreen (solo)" },
];

/** The shared 3-way control; presentation only — callers wire value/onChange. */
function PlacementSegmented({
  value,
  onChange,
}: {
  value: Placement;
  onChange: (p: Placement) => void;
}) {
  return (
    <SegmentedControl<Placement>
      options={OPTIONS}
      value={value}
      onChange={onChange}
      variant="ghost"
    />
  );
}

/**
 * Placement control contributed into `ActionBar.Item`. Provider-free: it reads
 * the focused tab's placement from the module-level focused-placement store
 * (`useFocusedPlacement`) and drives it via `setFocusedTabPlacement`, so it
 * renders correctly both inside `TabsProvider` (the docked tab-bar strip) and
 * outside it (the globally-mounted floating overlay).
 */
export function ActionBarPlacementControl() {
  const placement = useFocusedPlacement();
  return (
    <PlacementSegmented value={placement} onChange={setFocusedTabPlacement} />
  );
}
