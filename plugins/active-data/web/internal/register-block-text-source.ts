import {
  blockTextTokenExtension,
  registerBlockTextExtensionSource,
} from "@plugins/page/plugins/editor/web";
import type { BlockTextExtension } from "@plugins/page/plugins/editor/web";
import { activeDataInlineExtension } from "./inline-extension";
import { activeDataInlineWebNode } from "./active-data-inline-node";
import { renderInlineChip } from "./render-inline-chip";

// Side-effect: teach every page block editor about active-data's inline chips,
// so an id written in a page renders as the same chip it renders as in a
// conversation.
//
// A SOURCE, not an extension: the chip set is itself a registry that fills in as
// the plugin tiers load, so what is registered here is the lookup, called afresh
// every time the page editor asks. Registering a finished union instead would
// freeze whatever had loaded at this module's eval — and the page editor's seed
// and its doc-sourced projection would then be reading two different extension
// sets, which round-trips a chip node into plain characters.
//
// `"document"` is the page's surface. The prompt editor asks for `"transcript"`
// and gets a different union, which is how a chip that has no business in a page
// stays out of one without anybody here naming a contributor.
let cached: BlockTextExtension | null = null;
let cachedUnion: string | null = null;

registerBlockTextExtensionSource(() => {
  const extension = activeDataInlineExtension("document");
  if (!extension) return [];
  // Hand back a STABLE object while the union is unchanged: the page editor
  // derives one `InlineTokenExtension` per registered object and caches it on
  // identity, and those walks run at caret frequency. The union's own source
  // string IS the chip set's fingerprint — it changes exactly when a chip
  // declaring `"document"` registers.
  if (cached === null || cachedUnion !== extension.pattern.source) {
    cachedUnion = extension.pattern.source;
    cached = blockTextTokenExtension({
      id: extension.id,
      pattern: extension.pattern,
      // TRANSPARENT, not protected — and this is the whole reason `pattern` and
      // `markdownSpan` are two fields. A bare id is digits, lowercase letters and
      // hyphens: there is nothing in it the inline markdown scan could misread,
      // so masking it would buy nothing and COST the span its marks (a masked
      // span becomes its own unmarked run). That is exactly what went wrong while
      // the two were one field: `` `att-1787654245-y41m` `` pasted as markdown
      // parsed with no `code` mark, so the id a person wrote as documentation
      // came back as a live chip.
      markdownSpan: "transparent",
      node: activeDataInlineWebNode,
      // `renderInlineChip` is the ONE rendering of an inline token — the
      // anchored full-match rule that picks the chip, inside its boundary. So a
      // read-only surface paints a chip through exactly the call the Lexical
      // decorator paints it through, and an id whose chip is not in this
      // composition answers `null` and falls back to its raw characters on both.
      renderToken: ({ text }) => renderInlineChip(text),
    });
  }
  return [cached];
});
