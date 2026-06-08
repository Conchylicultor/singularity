import { z } from "zod";
import { scanPageLinkTokens } from "../../core";

// `data` is raw jsonb; only text-bearing blocks carry a `text` field.
const TextShape = z.object({ text: z.string() });

/** Global backlinks extractor: yield linked page ids from a block's inline tokens. */
export function extractInlinePageLinks(data: unknown): string[] {
  const r = TextShape.safeParse(data);
  return r.success ? scanPageLinkTokens(r.data.text) : [];
}
