import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData } from "@plugins/active-data/web";
import { PageLinkChip } from "./components/page-link-chip";
import { BLOCK_ID_RE } from "./internal/pattern";

export { PageLinkChip };

export default {
  description:
    "Renders raw `block-<id>` strings inline as clickable chips that open the page displaying that block in the page-detail pane. Models emit the bare id, no tag wrapping needed.",
  contributions: [
    ActiveData.Tag({ display: "inline", pattern: BLOCK_ID_RE, component: PageLinkChip }),
  ],
} satisfies PluginDefinition;
