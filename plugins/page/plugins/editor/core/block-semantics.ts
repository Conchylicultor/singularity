/**
 * What a text block's LINE **is**, in the accessibility tree — as opposed to what
 * it looks like (`BlockHandle.textVariant`, a font-size role) or what glyph
 * precedes it (`BlockHandle.marker`). A heading declares that it is a heading;
 * nothing derives it from the type id or from its typography, because "renders
 * large" and "is a heading" are different claims and only one of them is true of
 * a big paragraph.
 *
 * ## The union is CLOSED, and closed on two rules
 *
 * 1. **The role's ARIA required context must be nothing.** The editor renders the
 *    forest FLAT — a structural move must only reorder keyed siblings, or the
 *    moved block's DOM parent changes and its Lexical instance remounts (see
 *    `text-block-layout.tsx`). So no element spans a run of blocks and no element
 *    wraps a subtree. `listitem` requires an owning `list`; `blockquote` would
 *    have to CONTAIN the quoted passage, and a container's decoration is an inert
 *    backdrop painted behind the rows (`BlockFrameProps`), not a wrapper. Neither
 *    has anywhere honest to live here, so neither is an arm — and adding one is
 *    not a new arm, it is a new mechanism on the surface that owns runs.
 * 2. **The role must not have presentational children.** The line hosts a
 *    `contenteditable`. A role whose children are presentational (`button`,
 *    `option`, `tab`, `img`, `math`, …) would flatten the editing host into a
 *    label — the exact failure the block list's old `role="listbox"` produced.
 *    `heading` is safe: it takes its NAME from its contents, but its contents
 *    stay in the tree.
 *
 * `aria-level` cannot drift from `role="heading"` because they are one arm: there
 * is no way to state a level without a heading, or a heading without a level.
 *
 * Design: `research/2026-08-16-page-block-aria-semantics.md`.
 */
export type BlockSemantics = { role: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 };

/** The DOM attributes a block's declared semantics become. */
export interface BlockSemanticsAttrs {
  role?: string;
  "aria-level"?: number;
}

/**
 * The one arm → attributes mapping, so both surfaces (the editable
 * `BlockTextRenderer` and `read-only-view`) spread the same result rather than
 * each reading the union apart. Undefined in, empty out — React omits an
 * attribute whose value is `undefined`, so the plain-paragraph case adds nothing
 * to the DOM.
 */
export function semanticsAttrs(
  semantics: BlockSemantics | undefined,
): BlockSemanticsAttrs {
  if (!semantics) return {};
  switch (semantics.role) {
    case "heading":
      return { role: "heading", "aria-level": semantics.level };
  }
}
