import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BuildDetailSlots } from "@plugins/build/web";
import { BuildFixAction, useBuildFailed } from "./components/build-fix-section";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Launch-agent button in the build detail pane for failed builds.",
  contributions: [
    // One button is the whole section, so it is contributed as `actions` with no
    // `component`: the card is a single row carrying the action, not a chevron
    // that opens onto one button. `useAvailable` keeps a green build's detail
    // pane from growing a "Fix" bar with nothing behind it.
    BuildDetailSlots.Section({
      id: "fix",
      label: "Fix",
      icon: symbol("auto-fix-high"),
      actions: BuildFixAction,
      useAvailable: useBuildFailed,
    }),
  ],
} satisfies PluginDefinition;
