import { MdViewSidebar, MdWebAsset, MdFullscreen } from "react-icons/md";
import {
  useTabs,
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
 * In-strip placement control (contributed into `Apps.TabBarActions`). Renders
 * inside `TabsProvider`, so it reads/sets the focused tab's placement via the
 * `useTabs` hook directly.
 */
export function TabBarPlacementControl() {
  const { tabs, focusedTabId, setPlacement } = useTabs();
  const focused = tabs.find((t) => t.tabId === focusedTabId);
  if (!focused) return null;
  return (
    <PlacementSegmented
      value={focused.placement}
      onChange={(p) => setPlacement(focused.tabId, p)}
    />
  );
}

/**
 * Action-bar placement control (contributed into `ActionBar.Item`). The
 * action-bar / floating-bar render OUTSIDE `TabsProvider`, so this drives the
 * module-level `setFocusedTabPlacement` + the subscribable `useFocusedPlacement`
 * snapshot. This is the persistent home that gives solo a visible exit in every
 * app (the floating bar is portalled and shows even over a solo surface).
 */
export function ActionBarPlacementControl() {
  const placement = useFocusedPlacement();
  return (
    <PlacementSegmented value={placement} onChange={setFocusedTabPlacement} />
  );
}
