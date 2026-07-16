import { z } from "zod";
import { RichTextSchema } from "./rich-text";

/**
 * The canonical payload for editable-text block types. Owned by the editor
 * plugin (the primitive that renders editable text) so every text-bearing block
 * type — text, bulleted-list, and future heading/quote/to-do types — shares one
 * contract and one renderer (`BlockTextEditor`).
 *
 * `text` is always `RichText` (see `rich-text.ts`): the legacy `string | RichText`
 * union is retired. Strings are canonicalized to runs at the write boundary
 * (`parse-block-data.ts`), so a stored `text` is never a bare string. The same
 * `RichTextSchema` is composed by every text-bearing block type (to-do, toggle,
 * …) so they all gain inline marks uniformly.
 */
/**
 * Compile-time brand marking a schema produced by `textBlockSchema`. It lives
 * ONLY in the type system (a phantom `unique symbol` key), so `z.infer<S>` stays
 * clean — no runtime field, no wire presence. `defineBlock` keys its typed text
 * lens off this brand: `handle.text(data)` exists IFF the schema carries the
 * brand, so the lens is present exactly on text-bearing block types and typed
 * `undefined` on void ones. The runtime lens is installed off the derived
 * `acceptsText` flag; the two agree because every text block composes
 * `textBlockSchema` (a bare `z.object({ text })` would be text-bearing at runtime
 * but unbranded at the type level — no real block does this).
 */
declare const TEXT_BEARING: unique symbol;
export type TextBearingSchema = { readonly [TEXT_BEARING]: true };

/**
 * Schema factory for text-bearing block types (anything rendered through
 * `BlockTextEditor`). Guarantees the `text` field is the canonical
 * `string | RichText` contract, plus caller-supplied extra fields. Composing
 * this — rather than re-declaring `text` — makes a string-only `text` field
 * structurally impossible for new blocks, and stamps the `TextBearingSchema`
 * brand so `defineBlock` derives the typed text lens.
 */
export function textBlockSchema<T extends z.ZodRawShape>(extra: T) {
  const schema = z.object({ text: RichTextSchema, ...extra });
  return schema as typeof schema & TextBearingSchema;
}

export const textDataSchema = textBlockSchema({});
export type TextData = z.infer<typeof textDataSchema>;
