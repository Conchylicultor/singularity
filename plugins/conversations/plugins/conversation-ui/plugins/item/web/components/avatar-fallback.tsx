import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import type { ConversationItemConv } from "./conversation-item";
import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";

// Mirrors CONV_STATUS_DOT from conversation-item — kept in sync manually.
// Defined here to avoid a runtime circular import (conversation-item ↔ slots).
const STATUS_DOT: Record<ConversationStatus, string> = {
  starting: "bg-muted-foreground/60",
  working: "bg-info",
  waiting: "bg-warning",
  gone: "bg-warning/40",
  done: "bg-muted-foreground/40",
};

// Placeholder rendered by Item.Avatar when no contribution's predicate matches.
// Keeps all rows aligned along their title column. Shows the title's first
// letter on a deterministically-tinted disc so rows never appear blank.
export function AvatarFallback({
  conv,
  size,
}: {
  conv: ConversationItemConv;
  size: "xs" | "sm";
}) {
  return (
    <Avatar
      size={size}
      statusDot={STATUS_DOT[conv.status]}
      fallbackGlyph={conv.title?.trim()[0] ?? "?"}
      fallbackKey={conv.id}
    />
  );
}
