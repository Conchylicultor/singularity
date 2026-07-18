import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationCategoriesResource as conversationCategoriesDescriptor } from "../../shared";
import { conversationCategory } from "./tables";

const t = conversationCategory.table;

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change-feed routes a category
// insert/reclassify to a tuple iff the changed conversation ids intersect its
// set — so a classification never sweeps the whole table. The PK column
// `parent_id` is projected under the ALIAS `conversationId` (the point identity);
// `point.by` IS that identity pk. No orderBy — point sets are unordered.
export const conversationCategoriesResource = windowQueryResource(conversationCategoriesDescriptor, {
  from: t,
  select: {
    conversationId: t.parentId,
    category: t.category,
    source: t.source,
    classifiedAt: t.updatedAt,
  },
  point: { by: t.parentId },
});
