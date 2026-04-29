import type { PluginDefinition } from "@core";
import { ActiveData } from "@plugins/active-data/web";
import { ConvChip } from "./components/conv-chip";

export default {
  id: "active-data-conv",
  name: "Active Data: <conv> chip",
  description:
    "Renders <conv>conv-xxx</conv> as a clickable chip that opens the referenced conversation in the right side pane alongside the host conversation.",
  contributions: [ActiveData.Tag({ tag: "conv", component: ConvChip })],
} satisfies PluginDefinition;
