import type { ComponentType } from "react";
import type { ZodTypeAny, z } from "zod";

export interface BlockHandle<T> {
  type: string;
  schema: ZodTypeAny;
  parse(data: unknown): T;
  /**
   * Optional insert-menu label (e.g. "Text", "Link to page"). A block type
   * without a `label` is not offered in the editor's "add block" menu.
   */
  label?: string;
  /** Optional insert-menu icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Returns the default `data` payload for a freshly inserted block. */
  empty?: () => T;
  /**
   * Leading text that auto-converts a block into this type (e.g. `["* ", "- "]`
   * for a bulleted list). The shared text editor strips the matched prefix and
   * converts via `BlockEditorAPI.convertTo`, preserving any trailing text.
   */
  markdownPrefixes?: string[];
  /**
   * For editable-text block types: a static glyph rendered to the left of the
   * text (e.g. `"•"` for a bullet). Text-like block types that share the editor
   * plugin's `BlockTextRenderer` all resolve to the *same* renderer function, so
   * converting between them reconciles in place (the live editor and its caret
   * survive) rather than remounting.
   */
  marker?: string;
  /** For editable-text block types: placeholder shown when empty and focused. */
  placeholder?: string;
  /**
   * For text block types with a boolean state: the shared text renderer renders
   * an interactive checkbox marker bound to `data[field]`, and applies
   * `doneClassName` (default: strikethrough + muted) to the text content when the
   * field is truthy. Generic — the renderer never names a specific block type.
   */
  toggle?: { field: string; doneClassName?: string };
  /**
   * When "always", the editor shows the collapse chevron for this block type even
   * when it has no children yet (used by the toggle block). Omitted = the chevron
   * appears only when the block actually has children.
   */
  collapsible?: "always";
  /**
   * Enter-split behavior. By default a block splits into a sibling of the same
   * type. A block with this set instead nests the split-off content as its FIRST
   * CHILD *when it is currently expanded* (a collapsed block still splits into a
   * sibling). `childType` is the type created for that child. Generic — used by
   * the toggle block; the editor core never names a block type.
   */
  splitChildWhenExpanded?: { childType: string };
}

export function defineBlock<S extends ZodTypeAny>(opts: {
  type: string;
  schema: S;
  label?: string;
  icon?: ComponentType<{ className?: string }>;
  empty?: () => z.infer<S>;
  markdownPrefixes?: string[];
  marker?: string;
  placeholder?: string;
  toggle?: { field: string; doneClassName?: string };
  collapsible?: "always";
  splitChildWhenExpanded?: { childType: string };
}): BlockHandle<z.infer<S>> {
  return {
    type: opts.type,
    schema: opts.schema,
    parse: (data) => opts.schema.parse(data),
    label: opts.label,
    icon: opts.icon,
    empty: opts.empty,
    markdownPrefixes: opts.markdownPrefixes,
    marker: opts.marker,
    placeholder: opts.placeholder,
    toggle: opts.toggle,
    collapsible: opts.collapsible,
    splitChildWhenExpanded: opts.splitChildWhenExpanded,
  };
}
