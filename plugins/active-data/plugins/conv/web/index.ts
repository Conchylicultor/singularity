import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData } from "@plugins/active-data/web";
import { ConvChip } from "./components/conv-chip";
import { CONV_ID_RE } from "./internal/pattern";

export { ConvChip };

export default {
  description:
    "Renders raw `conv-<id>` strings inline as clickable chips that open the referenced conversation in the right side pane alongside the host conversation. Models emit the bare id, no tag wrapping needed.",
  contributions: [ActiveData.Tag({ display: "inline", pattern: CONV_ID_RE, component: ConvChip })],
} satisfies PluginDefinition;
