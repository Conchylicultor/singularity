import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useCategoryFor } from "../internal/use-category";
import { colorClassFor } from "../internal/colors";

// Small, non-interactive chip for the sidebar row. No popover — clicks pass
// through to the surrounding row navigation. Renders nothing until the
// conversation has been classified, so unclassified rows look unchanged.
export function CategoryChipRow({ conv }: { conv: ConversationItemConv }) {
  const category = useCategoryFor(conv.id);
  if (!category) return null;
  return (
    <span
      className={`shrink-0 truncate rounded-sm px-1 py-px text-[9px] font-medium uppercase tracking-wide ${colorClassFor(category)}`}
      title={category}
    >
      {category}
    </span>
  );
}
