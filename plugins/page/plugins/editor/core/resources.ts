import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { BlockSchema } from "./schemas";
import type { Block } from "./schemas";

// All pages (`type="page"` blocks), ordered by rank. The sidebar tree is built
// from these by `parentId`.
export const pagesResource = resourceDescriptor<Block[]>(
  "pages",
  z.array(BlockSchema),
  [],
);

// A page's content: non-page blocks scoped by `pageId`.
export const blocksResource = resourceDescriptor<Block[], { pageId: string }>(
  "page-blocks",
  z.array(BlockSchema),
  [],
);
