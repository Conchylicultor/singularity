import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TreeDisclosure } from "@plugins/ui/plugins/tree-disclosure/web";
import { DimmedLeafDisclosure } from "./components/dimmed-leaf-disclosure";

export default {
  description:
    "Dimmed-leaf tree disclosure — the merged box, with childless rows' icons desaturated so parents read stronger.",
  contributions: [
    TreeDisclosure.Variant({
      id: "dimmed-leaf",
      label: "Dimmed leaves",
      match: "dimmed-leaf",
      component: DimmedLeafDisclosure,
    }),
  ],
} satisfies PluginDefinition;
