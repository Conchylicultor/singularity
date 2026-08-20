import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { configNavPane, configDetailPane } from "./internal/panes";
import { ConfigDetailSlots } from "./slots";

export {
  configNavPane,
  configDetailPane,
  configDetailRoute,
} from "./internal/panes";
export { ConfigNav } from "./components/config-nav";
export { ConfigSidebarButton } from "./components/config-sidebar-button";
export { ConfigDetailSlots } from "./slots";
export type {
  ConfigConflictContext,
  ConfigConflictField,
  ConfigConflictFieldStatus,
  ConfigConflictKind,
} from "./slots";

export default {
  description:
    "Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields. Surfaced inside the Settings app.",
  contributions: [
    Pane.Register({ pane: configNavPane }),
    Pane.Register({ pane: configDetailPane }),
  ],
  slots: {
    "config-v2-nav": configNavPane,
    "config-v2-detail": configDetailPane,
    ConflictAction: ConfigDetailSlots.ConflictAction,
  },
} satisfies PluginDefinition;
