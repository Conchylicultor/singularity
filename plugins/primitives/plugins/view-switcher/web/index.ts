import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ViewSwitcher,
  type ViewSwitcherProps,
  type ViewSwitcherOption,
} from "./components/view-switcher";

export default {
  description:
    "Presentational view-switcher chrome: borderless ghost-pill SegmentedControl mapping {id,title,icon} options to a single-select switcher. Pure chrome — selection state stays with the caller.",
  contributions: [],
} satisfies PluginDefinition;
