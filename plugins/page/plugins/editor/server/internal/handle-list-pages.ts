import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listPages } from "../../core/endpoints";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";

export const handleListPages = implement(listPages, async () => {
  const rows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.type, PAGE_BLOCK_TYPE), isNull(_blocks.deletedAt)))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return rows.map((r) => BlockSchema.parse(r));
});
