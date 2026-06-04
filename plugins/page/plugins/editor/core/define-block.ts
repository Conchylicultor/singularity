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
  };
}
