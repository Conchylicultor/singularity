import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageReference } from "@plugins/page/plugins/page-reference/web";
import { canOpenAside, OpenAsideAction } from "./components/open-aside-action";

export default {
  description:
    "Open-in-side-pane action on a page reference: hovering a sub-page row or a link block reveals a button that opens the referenced page in a column beside the current one, leaving it on screen. Contributed into PageReference.Actions, and declared unavailable where the host has no second column to give — so a single-surface embed shows no affordance at all.",
  contributions: [
    PageReference.Actions({
      id: "open-aside",
      component: OpenAsideAction,
      available: canOpenAside,
    }),
  ],
} satisfies PluginDefinition;
