import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Explorer } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { MembershipPin, MembershipTint } from "./components/membership-band";

// The canonical compare-mode tint + legend mapping. Exported so the Compositions
// pane's diff legend / delta chips reuse the EXACT same colors the tree band paints
// — single source of truth, no drift between the controls and the tinted tree.
export { DIFF_TINT, DIFF_LEGEND } from "./components/membership-band";

export default {
  description:
    "Tints each explorer tree row by its membership state in the active composition, with a pin-as-root affordance.",
  contributions: [
    Explorer.TreeRowAccent({ id: "membership", component: MembershipTint }),
    Explorer.TreeRowBadge({ id: "membership", component: MembershipPin }),
  ],
} satisfies PluginDefinition;
