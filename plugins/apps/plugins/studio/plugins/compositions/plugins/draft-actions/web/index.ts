import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { CompositionDetail } from "@plugins/apps/plugins/studio/plugins/compositions/web";
import { DraftActions } from "./components/draft-actions";

export default {
  description:
    "Draft persistence section in the composition detail pane: editable name plus Save / Delete / Clear.",
  contributions: [
    CompositionDetail.Section({
      id: "draft-actions",
      label: "Draft",
      component: DraftActions,
    }),
  ],
} satisfies PluginDefinition;
