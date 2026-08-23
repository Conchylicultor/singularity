import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData } from "@plugins/active-data/web";
import { PrototypeChip } from "./components/prototype-chip";
import { PROTOTYPE_INLINE_RE } from "./internal/pattern";

export { PrototypeChip };

export default {
  description:
    "Renders raw `proto-<id>` strings inline as clickable chips that open the mock in the prototype-detail pane. Models emit the bare id, no tag wrapping needed.",
  contributions: [
    ActiveData.Tag({
      display: "inline",
      pattern: PROTOTYPE_INLINE_RE,
      component: PrototypeChip,
    }),
  ],
} satisfies PluginDefinition;
