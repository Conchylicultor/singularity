import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { DocumentSchema, BlockSchema } from "../../core/schemas";
import { documentsResource, blocksResource } from "../../core/resources";
import type { Document, Block } from "../../core/schemas";
import { _documents, _blocks } from "./tables";

export const documentsLiveResource = defineResource<Document[]>({
  key: documentsResource.key,
  mode: "push",
  schema: z.array(DocumentSchema),
  loader: async () =>
    db
      .select()
      .from(_documents)
      .orderBy(asc(_documents.createdAt)) as unknown as Promise<Document[]>,
});

export const blocksLiveResource = defineResource<Block[]>({
  key: blocksResource.key,
  mode: "push",
  schema: z.array(BlockSchema),
  loader: async () =>
    db
      .select()
      .from(_blocks)
      .orderBy(asc(_blocks.rank), asc(_blocks.createdAt)) as unknown as Promise<Block[]>,
});
