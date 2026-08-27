import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, inlineChip } from "@plugins/active-data/web";
import { CONV_ID_RE } from "../core";
import { ConvChip } from "./components/conv-chip";

export { ConvChip };

export default {
  description:
    "Renders raw `conv-<id>` strings inline as clickable chips that open the referenced conversation in the right side pane alongside the host conversation. Models emit the bare id, no tag wrapping needed.",
  contributions: [
    ActiveData.Tag(
      inlineChip({
        id: "conv",
        pattern: CONV_ID_RE,
        surfaces: ["transcript", "document"],
        component: ConvChip,
      }),
    ),
  ],
} satisfies PluginDefinition;
