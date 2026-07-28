import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TreeDisclosure } from "@plugins/ui/plugins/tree-disclosure/web";
import { MergedDisclosure } from "./components/merged-disclosure";

export default {
  description:
    "Merged tree disclosure — icon and chevron share one box (icon at rest, chevron on hover), Notion style.",
  contributions: [
    TreeDisclosure.Variant({
      id: "merged",
      label: "Merged",
      match: "merged",
      component: MergedDisclosure,
    }),
  ],
} satisfies PluginDefinition;
