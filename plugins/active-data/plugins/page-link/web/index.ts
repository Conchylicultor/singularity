import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  InlineChip,
  inlineChip,
} from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/web";
import { PageLinkChip } from "./components/page-link-chip";
import { BLOCK_ID_RE } from "./internal/pattern";

export { PageLinkChip };

export default {
  description:
    "Renders raw `block-<id>` strings inline as clickable chips that open what the id names: a page id opens the page-detail pane, a content-block id opens the block-detail pane (that block as a page of its own). Models emit the bare id, no tag wrapping needed.",
  contributions: [
    InlineChip.Tag(
      inlineChip({
        id: "page-link",
        pattern: BLOCK_ID_RE,
        // TRANSCRIPT ONLY. A page already has a first-class link to a block —
        // the editor's own `[[page:<id>]]` token — and this pattern would match
        // the same ids inside it, so two token families would compete for one
        // span. In a conversation there is no such token and a bare `block-…`
        // is the only spelling, so the chip earns its keep there.
        surfaces: ["transcript"],
        component: PageLinkChip,
      }),
    ),
  ],
} satisfies PluginDefinition;
