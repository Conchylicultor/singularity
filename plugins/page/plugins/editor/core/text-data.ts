import { z } from "zod";
import { RichTextSchema } from "./rich-text";

/**
 * The canonical payload for editable-text block types. Owned by the editor
 * plugin (the primitive that renders editable text) so every text-bearing block
 * type — text, bulleted-list, and future heading/quote/to-do types — shares one
 * contract and one renderer (`BlockTextEditor`).
 *
 * `text` is `string | RichText` (see `rich-text.ts`): a legacy plain string is a
 * single unmarked run, coerced via `runsOf`. This is the back-compat seam — no
 * DB migration. The same `RichTextSchema` is composed by every text-bearing block
 * type (to-do, toggle, …) so they all gain inline marks uniformly.
 */
export const textDataSchema = z.object({ text: RichTextSchema });
export type TextData = z.infer<typeof textDataSchema>;
