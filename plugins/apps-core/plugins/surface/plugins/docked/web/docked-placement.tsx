import { MdViewSidebar } from "react-icons/md";
import type { PlacementDef } from "@plugins/apps-core/plugins/surface/web";

/**
 * The docked placement: the default, full-area surface — the tab "fills" the
 * surface below the tab strip and shows only when focused. No chrome, no backdrop,
 * no dynamic style; a static class on the host's stable container is all it needs.
 *
 * `themeScope: "app"` makes the focused docked tab's chrome wear the app theme;
 * `containerClassName` paints the app's own app-scoped background (the container
 * carries `data-theme-scope="app:<id>"`, so any transparent region falls back to
 * the app theme, never the chrome/global backdrop behind it).
 */
export const dockedDef: PlacementDef = {
  id: "docked",
  label: "Dock in tab strip",
  icon: MdViewSidebar,
  order: 0,
  default: true,
  themeScope: "app",
  containerClassName: "absolute inset-0 bg-background",
};
