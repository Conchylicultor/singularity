import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import {
  CONV_STATUS_DOT,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useCategoryFor } from "../internal/use-category";
import { useCategoryAvatars } from "../internal/use-category-avatars";

export function CategoryAvatarRow({ conv }: { conv: ConversationItemConv }) {
  const category = useCategoryFor(conv.id);
  const avatars = useCategoryAvatars();
  const avatar = category ? avatars[category] : undefined;
  const hasIcon =
    avatar?.icon != null || (avatar?.svgNodes != null && avatar.svgNodes.length > 0);

  // Without a category icon, fall back to a title-glyph on a deterministic
  // tint instead of a blank disc (rows must never appear empty).
  return (
    <Avatar
      icon={avatar?.icon ?? null}
      svgNodes={avatar?.svgNodes ?? null}
      size="sm"
      statusDot={CONV_STATUS_DOT[conv.status]}
      colorless={hasIcon}
      fallbackGlyph={hasIcon ? undefined : (conv.title?.trim()[0] ?? "?")}
      fallbackKey={hasIcon ? undefined : conv.id}
    />
  );
}
