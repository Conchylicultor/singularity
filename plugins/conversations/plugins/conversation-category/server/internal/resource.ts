import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationCategoriesResource as conversationCategoriesDescriptor } from "../../shared";
import { _conversationCategories } from "./tables";

const t = _conversationCategories;

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE id IN (ids)`), and the change feed routes an assignment write to a
// tuple iff the changed row ids intersect its set — so classifying one
// conversation never sweeps the table.
//
// `point.by` IS the identity pk: `id` is `categoryRowId(conversationId,
// categoryId)`, so one subscribed id names exactly one (conversation, category)
// assignment. No orderBy — point sets are unordered; callers index by categoryId.
export const conversationCategoriesResource = windowQueryResource(
  conversationCategoriesDescriptor,
  {
    from: t,
    select: {
      id: t.id,
      conversationId: t.conversationId,
      categoryId: t.categoryId,
      item: t.item,
      source: t.source,
      classifiedAt: t.updatedAt,
    },
    point: { by: t.id },
  },
);
