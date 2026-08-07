import { useMemo } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useCategories } from "../internal/use-categories";
import { useCategoryRows } from "../internal/use-conversation-categories";
import { CategoryChip } from "./category-chip";

/**
 * Every configured category as its own chip in the conversation header.
 *
 * ONE contribution renders all of them: the categories are user config, so their
 * count is only known at runtime and there is no set of contribution ids to
 * register. One subscription covers the lot, and each chip gets its assignment
 * as a prop.
 *
 * Returns a fragment, not a wrapper element — `CollapsibleWrap` in the header
 * walks through `display: contents` but not through a `div`, so a wrapper would
 * become one wide child it cannot wrap.
 */
export function CategoryChipToolbar() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const categories = useCategories();
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const rows = useCategoryRows(convId, categoryIds);

  if (!conversation) return null;
  if (conversation.kind === "agent") return null;

  return (
    <>
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          conversationId={conversation.id}
          category={category}
          item={rows.get(category.id)?.item ?? null}
        />
      ))}
    </>
  );
}
