import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import {
  CONV_STATUS_DOT,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useCategoryFor } from "../internal/use-category";
import { useCategoryAvatars } from "../internal/use-category-avatars";
import { autoColorKey } from "../internal/colors";

export function CategoryAvatarRow({ conv }: { conv: ConversationItemConv }) {
  const category = useCategoryFor(conv.id);
  const avatars = useCategoryAvatars();
  const avatar = category ? avatars[category] : undefined;
  const autoColor = category ? autoColorKey(category) : undefined;

  return (
    <Avatar
      icon={avatar?.icon ?? null}
      color={avatar?.color ?? autoColor ?? null}
      svgNodes={avatar?.svgNodes ?? null}
      size="sm"
      statusDot={CONV_STATUS_DOT[conv.status]}
      fallbackKey={category ?? conv.id}
    />
  );
}
