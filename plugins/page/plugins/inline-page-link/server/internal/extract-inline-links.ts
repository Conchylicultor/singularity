import { z } from "zod";
import { plainOf } from "@plugins/page/plugins/editor/core";
import { scanPageLinkTokens } from "../../core";

// `data` is raw jsonb; only text-bearing blocks carry a `text` field. `text` may
// be a legacy string or structured rich-text runs — `plainOf` flattens both,
// preserving the `[[<pageId>]]` tokens the scanner needs.
const TextShape = z.object({ text: z.unknown() });

/** Global backlinks extractor: yield linked page ids from a block's inline tokens. */
export function extractInlinePageLinks(data: unknown): string[] {
  const r = TextShape.safeParse(data);
  return r.success ? scanPageLinkTokens(plainOf(r.data.text)) : [];
}
