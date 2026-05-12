import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import {
  CONV_STATUS_DOT,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useCategoryFor } from "../internal/use-category";
import { useCategoryColors } from "../internal/use-category-colors";
import { autoColorKey } from "../internal/colors";

export function CategoryAvatarRow({ conv }: { conv: ConversationItemConv }) {
  const category = useCategoryFor(conv.id);
  const overrides = useCategoryColors();
  const override = category ? overrides[category] : undefined;
  const autoColor = category ? autoColorKey(category) : undefined;

  return (
    <Avatar
      icon={override?.iconKey ?? null}
      color={override?.colorKey ?? autoColor ?? null}
      size="sm"
      statusDot={CONV_STATUS_DOT[conv.status]}
      fallbackKey={category ?? conv.id}
    />
  );
}
