import { asc } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationCategoriesResource as conversationCategoriesDescriptor } from "../../shared";
import { conversationCategory } from "./tables";

const t = conversationCategory.table;

// Compiled keyed query-resource (conversation-progress twin): the loader,
// Layer-2 scoped loader, and identityTable ("conversations_ext_category") all
// derive from this one declaration. The PK column `parent_id` is projected under
// the ALIAS `conversationId` — the compiler keys the resource on the alias
// (matching the descriptor's pkField) while the scoped refill still filters on
// the real column. asc(parentId) is immutable, and a re-classify is an UPDATE of
// category/source/classifiedAt → one scoped keyed delta.
export const conversationCategoriesResource = queryResource(conversationCategoriesDescriptor, {
  from: t,
  select: {
    conversationId: t.parentId,
    category: t.category,
    source: t.source,
    classifiedAt: t.updatedAt,
  },
  orderBy: asc(t.parentId),
});
