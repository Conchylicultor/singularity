import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { DocumentSchema, BlockSchema } from "./schemas";
import type { Document, Block } from "./schemas";

export const documentsResource = resourceDescriptor<Document[]>(
  "page-documents",
  z.array(DocumentSchema),
  [],
);

export const blocksResource = resourceDescriptor<Block[]>(
  "page-blocks",
  z.array(BlockSchema),
  [],
);
