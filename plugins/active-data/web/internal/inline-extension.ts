import {
  tokenExtension,
  type InlineTokenExtension,
} from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";
import { inlineChips, type ChipSurface } from "./inline-registry";
import { activeDataInlineWebNode } from "./active-data-inline-node";

/**
 * Every chip that declared `surface`, as ONE token extension a Lexical host can
 * register: a union of the chips' patterns feeding the single generic
 * `ActiveDataInlineNode`, which stores the raw matched substring and resolves
 * its chip at decorate time.
 *
 * That is why declaring a chip lights the token up in the editor with zero
 * per-chip Lexical wiring — and why there is exactly one node type to register
 * however many chips exist.
 *
 * `null` when no chip declared this surface: there is nothing to match, so
 * registering the extension would only add an empty alternation.
 *
 * Built fresh on every call, never memoized: chips register progressively as
 * the plugin tiers load, so a union compiled too early is missing alternatives
 * and its tokens render as plain characters with nothing failing.
 */
export function activeDataInlineExtension(
  surface: ChipSurface,
): InlineTokenExtension | null {
  const chips = inlineChips(surface);
  if (chips.length === 0) return null;
  // Each source wrapped non-capturing; the node only ever reads m[0], so inner
  // capture groups and per-pattern lookarounds are preserved.
  const union = new RegExp(
    chips.map((c) => `(?:${c.pattern.source})`).join("|"),
    "g",
  );
  return tokenExtension({
    id: `active-data-inline-${surface}`,
    pattern: union,
    node: activeDataInlineWebNode,
  });
}
