import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, inlineChip } from "@plugins/active-data/web";
import { PROTOTYPE_INLINE_RE } from "../core";
import { PrototypeChip } from "./components/prototype-chip";

export { PrototypeChip };

export default {
  description:
    "Renders raw `proto-<id>` strings inline as clickable chips that open the mock in the prototype-detail pane. Models emit the bare id, no tag wrapping needed.",
  contributions: [
    ActiveData.Tag(
      inlineChip({
        id: "prototype",
        pattern: PROTOTYPE_INLINE_RE,
        surfaces: ["transcript", "document"],
        component: PrototypeChip,
      }),
    ),
  ],
} satisfies PluginDefinition;
