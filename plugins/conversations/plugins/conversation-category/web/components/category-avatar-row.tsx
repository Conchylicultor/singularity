import { useMemo } from "react";
import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import {
  CONV_STATUS_DOT,
  type ConversationItemConv,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useAvatarCategoryId, useCategoryAvatars } from "../internal/use-categories";
import { useCategoryRows } from "../internal/use-conversation-categories";

export function CategoryAvatarRow({ conv }: { conv: ConversationItemConv }) {
  // Exactly ONE category paints the avatar, so a sidebar row subscribes to one
  // id — the same per-row budget as before multiple categories existed. With no
  // avatar category chosen the id set is empty and costs no query at all.
  const avatarCategoryId = useAvatarCategoryId();
  const categoryIds = useMemo(
    () => (avatarCategoryId ? [avatarCategoryId] : []),
    [avatarCategoryId],
  );
  const rows = useCategoryRows(conv.id, categoryIds);
  const avatars = useCategoryAvatars(avatarCategoryId);

  const item = avatarCategoryId ? rows.get(avatarCategoryId)?.item : undefined;
  const avatar = item ? avatars[item] : undefined;
  const hasIcon =
    avatar?.icon != null || (avatar?.svgNodes != null && avatar.svgNodes.length > 0);

  // Without a category icon, fall back to a title-glyph on a deterministic
  // tint instead of a blank disc (rows must never appear empty).
  return (
    <Avatar
      icon={avatar?.icon ?? null}
      svgNodes={avatar?.svgNodes ?? null}
      statusDot={CONV_STATUS_DOT[conv.status]}
      colorless={hasIcon}
      fallbackGlyph={hasIcon ? undefined : (conv.title?.trim()[0] ?? "?")}
      fallbackKey={hasIcon ? undefined : conv.id}
    />
  );
}
