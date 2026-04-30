import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useCategoryFor } from "../internal/use-category";
import { useCategoryColors } from "../internal/use-category-colors";
import { colorClassFor } from "../internal/colors";

export function CategoryChipRow({ conv }: { conv: ConversationItemConv }) {
  const category = useCategoryFor(conv.id);
  const colors = useCategoryColors();
  if (conv.kind === "agent") return null;
  if (!category) return null;
  return (
    <span
      className={`shrink-0 truncate rounded-sm px-1 py-px text-[9px] font-medium uppercase tracking-wide ${colorClassFor(category, colors)}`}
      title={category}
    >
      {category}
    </span>
  );
}
