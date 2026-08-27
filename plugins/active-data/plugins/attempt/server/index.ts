import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Editor } from "@plugins/page/plugins/editor/server";
import { activeDataInlineNode } from "@plugins/active-data/core";
import { ATTEMPT_ID_RE } from "../core";

export default {
  description:
    "The attempt-id token at the page-editor's server boundary: locates `att-<id>` spans and names the shared active-data inline node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.",
  contributions: [
    // The SAME pattern the chip declares to `inlineChip`, and the SAME node spec
    // object the browser's `ActiveDataInlineNode` decorates. Every active-data
    // inline chip feeds ONE node, so the four sub-plugins each contribute their
    // own pattern against this one object — which is exactly the case the
    // registry allows (identical spec object) and the case it refuses (two
    // different objects claiming one type).
    //
    // `markdownSpan: "transparent"` — the pattern says WHERE the token is; it does
    // NOT ask for the token's bytes to be masked from the marks-aware inline
    // markdown scan, and a bare id must not be. It is digits, lowercase letters
    // and hyphens: nothing the scan could misread, so masking would buy nothing
    // and COST the span its marks (a masked span becomes its own unmarked run).
    // While the two were one field, `` `att-<id>` `` pasted as markdown lost its
    // `code` mark and chipped itself — documentation turning into a widget.
    Editor.InlineToken({
      pattern: ATTEMPT_ID_RE,
      markdownSpan: "transparent",
      node: activeDataInlineNode,
    }),
  ],
} satisfies ServerPluginDefinition;
