import { z } from "zod";

/**
 * The canonical payload for editable-text block types. Owned by the editor
 * plugin (the primitive that renders editable text) so every text-bearing block
 * type — text, bulleted-list, and future heading/quote/to-do types — shares one
 * contract and one renderer (`BlockTextEditor`).
 */
export const textDataSchema = z.object({ text: z.string() });
export type TextData = z.infer<typeof textDataSchema>;
