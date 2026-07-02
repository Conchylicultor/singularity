import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { threadPane } from "./panes";

export { threadPane } from "./panes";

export default {
  description:
    "Mail reading pane: the threadPane Miller column showing a thread's messages oldest→newest, each a collapsible card (newest expanded) with sender header, hydrated HTML/text body (privacy-safe images, inline cid: resolution), and attachment chips.",
  contributions: [Pane.Register({ pane: threadPane })],
} satisfies PluginDefinition;
