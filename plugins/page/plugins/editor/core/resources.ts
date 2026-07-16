import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { BlockSchema, PageRowSchema } from "./schemas";
import type { Block, PageRow } from "./schemas";

// All pages (`type="page"` blocks). The sidebar tree is built from these by
// `pageId` (the nearest page ancestor — `parentId` may point at a content
// block), and ordered by `docRank` — the loader's derived document-order key
// (see `PageRowSchema`), NOT the raw storage `rank`. Array order ≡ `docRank`
// order.
export const pagesResource = resourceDescriptor<PageRow[]>(
  "pages",
  z.array(PageRowSchema),
  [],
);

// A page's content: non-page blocks scoped by `pageId`.
export const blocksResource = resourceDescriptor<Block[], { pageId: string }>(
  "page-blocks",
  z.array(BlockSchema),
  [],
);
