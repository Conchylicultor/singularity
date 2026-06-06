import type { ReactNode } from "react";
import { Avatar, type AvatarSize } from "@plugins/primitives/plugins/avatar/web";
import type { ConversationPreprompt } from "../../shared";

// Renders a preprompt's chosen icon as a small colored avatar disc, sourced
// from the conversation's launch-time snapshot. When the preprompt has no
// icon, renders `fallback` (a header chip uses its default glyph; the sidebar
// marker passes nothing so unset preprompts stay unadorned).
export function PrepromptIcon({
  record,
  size = "xs",
  fallback = null,
}: {
  record: ConversationPreprompt;
  size?: AvatarSize;
  fallback?: ReactNode;
}) {
  const nodes = record.icon?.svgNodes;
  if (!nodes?.length) return <>{fallback}</>;
  return (
    <Avatar
      size={size}
      svgNodes={nodes}
      color={record.icon?.color ?? null}
      fallbackKey={record.prepromptId}
      title={record.title}
    />
  );
}
