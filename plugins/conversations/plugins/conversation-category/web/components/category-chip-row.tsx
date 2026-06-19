import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useCategoryFor } from "../internal/use-category";
import { colorClassFor } from "../internal/colors";

export function CategoryChipRow({ conv }: { conv: ConversationItemConv }) {
  const category = useCategoryFor(conv.id);
  if (conv.kind === "agent") return null;
  if (!category) return null;
  return (
    <span
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid (non-shrinking) inline category chip in the conversation row's chips flex; truncate is defensive
      className={`shrink-0 truncate rounded-sm p-chip text-3xs font-medium uppercase tracking-wide ${colorClassFor(category)}`}
      title={category}
    >
      {category}
    </span>
  );
}
