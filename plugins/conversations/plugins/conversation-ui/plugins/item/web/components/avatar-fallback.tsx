import { Avatar } from "@plugins/primitives/plugins/avatar/web";
import type { ConversationItemConv } from "./conversation-item";
import type { ConversationStatus } from "@plugins/conversations/core";

// Mirrors CONV_STATUS_DOT from conversation-item — kept in sync manually.
// Defined here to avoid a runtime circular import (conversation-item ↔ slots).
const STATUS_DOT: Record<ConversationStatus, string> = {
  starting: "bg-muted-foreground/60",
  working: "bg-[oklch(0.58_0.1_240)]",
  waiting: "bg-warning",
  gone: "bg-warning/40",
  done: "bg-muted-foreground/40",
};

// Blank-disc placeholder rendered by Item.Avatar when no contribution's
// predicate matches. Keeps all rows aligned along their title column.
export function AvatarFallback({
  conv,
  size,
}: {
  conv: ConversationItemConv;
  size: "xs" | "sm";
}) {
  return <Avatar size={size} statusDot={STATUS_DOT[conv.status]} />;
}
