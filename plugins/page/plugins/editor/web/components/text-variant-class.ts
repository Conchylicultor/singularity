import type { BlockTextVariant } from "../../core";
import "./block-document-scale.css";

/**
 * Maps a semantic typography variant to its document-scale role. The block
 * editor is a *document* surface, so its editable text uses the larger, airier
 * `doc-text-*` reading scale (Notion parity) rather than the dense UI-chrome
 * `text-*` utilities. See `block-document-scale.css` for the rationale.
 *
 * Its own module (with the stylesheet import) because TWO things must sit on
 * the block's line at the same metrics: the editable text itself
 * (`BlockTextEditor`) and the hydration skeleton painted over it while the
 * block's content doc is still arriving (`HydrationPlaceholder`). A skeleton
 * sized off a different scale than the line it stands in reads as a layout jump
 * the moment the text lands.
 */
export const TEXT_VARIANT_CLASS: Record<BlockTextVariant, string> = {
  title: "doc-text-title",
  heading: "doc-text-heading",
  subheading: "doc-text-subheading",
  body: "doc-text-body",
  label: "doc-text-label",
  caption: "doc-text-caption",
};
