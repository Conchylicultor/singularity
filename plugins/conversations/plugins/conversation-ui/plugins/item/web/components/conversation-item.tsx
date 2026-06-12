import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type { ConversationKind } from "@plugins/tasks/plugins/tasks-core/core";
import type { ConversationStatus } from "@plugins/conversations/core";
import { formatRelativeTime, RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Item } from "../slots";

export { formatRelativeTime };

function ChipsSlot({ conv }: { conv: ConversationItemConv }) {
  const items = Item.Chips.useContributions();
  if (items.length === 0) return null;
  return (
    <Item.Chips.Render>
      {(item) => <item.component conv={conv} />}
    </Item.Chips.Render>
  );
}

// Renders the first Item.Avatar contribution whose `match` predicate returns
// true for this conversation. Falls back to a blank-disc placeholder (via the
// slot's configured fallback) so the title column stays aligned across rows.
function AvatarSlot({ conv, size }: { conv: ConversationItemConv; size: "xs" | "sm" }) {
  return <Item.Avatar.Dispatch conv={conv} size={size} />;
}

export const CONV_STATUS_DOT: Record<ConversationStatus, string> = {
  starting: "bg-muted-foreground/60",
  working: "bg-info",
  waiting: "bg-warning",
  gone: "bg-warning/40",
  done: "bg-muted-foreground/40",
};

// Structural prop type — accepts both the full `Conversation` and the
// narrower `ConversationSummary` carried by `attemptsResource`. Anything
// with these fields renders. `taskId` is optional because `ConversationSummary`
// doesn't carry it (only the full Conversation row does); contributions that
// need it should bail out when it's undefined.
export type ConversationItemConv = {
  id: string;
  title: string | null;
  status: ConversationStatus;
  kind: ConversationKind;
  createdAt: Date;
  spawnedBy?: string | null;
  taskId?: string | null;
};

export type ConversationItemProps = {
  conv: ConversationItemConv;
  layout?: "block" | "inline";
};

export function ConvStatusDot({ conv }: { conv: ConversationItemConv }) {
  return <StatusDot colorClass={CONV_STATUS_DOT[conv.status]} className="inline-block" />;
}

export function ConvSysBadge({ conv }: { conv: ConversationItemConv }) {
  if (conv.kind !== "system") return null;
  return (
    <Badge size="sm" className="shrink-0 text-muted-foreground/80">
      sys
    </Badge>
  );
}

export function ConvTitle({ conv }: { conv: ConversationItemConv }) {
  const muted = conv.status === "gone" || conv.status === "done";
  return (
    <Text
      as="span"
      variant="caption"
      className={cn(
        "min-w-0 flex-1 truncate",
        muted && "text-muted-foreground",
      )}
    >
      {conv.title ?? "Starting…"}
    </Text>
  );
}

export function ConvRelativeTime({ conv }: { conv: ConversationItemConv }) {
  const isSystem = conv.kind === "system";
  return (
    <span className="shrink-0 text-3xs tabular-nums text-muted-foreground/60">
      {isSystem && conv.spawnedBy ? `${conv.spawnedBy} · ` : null}
      <RelativeTime date={conv.createdAt} />
    </span>
  );
}

export function ConversationItem({
  conv,
  layout = "block",
}: ConversationItemProps) {
  const active = conv.status === "working";
  if (layout === "inline") {
    return (
      <span className={cn("inline-flex max-w-full items-center gap-1.5", active && "opacity-60")}>
        <AvatarSlot conv={conv} size="xs" />
        <ConvTitle conv={conv} />
        <ConvSysBadge conv={conv} />
        <ChipsSlot conv={conv} />
      </span>
    );
  }
  return (
    <div className={cn("flex w-full items-start gap-2 overflow-hidden", active && "opacity-60")}>
      <span className="mt-0.5">
        <AvatarSlot conv={conv} size="sm" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <ConvTitle conv={conv} />
          <ConvSysBadge conv={conv} />
        </div>
        <div className="flex items-center gap-1.5">
          <ChipsSlot conv={conv} />
          <span className="ml-auto">
            <ConvRelativeTime conv={conv} />
          </span>
        </div>
      </div>
    </div>
  );
}
