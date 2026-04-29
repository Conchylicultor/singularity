import type {
  ConversationKind,
  ConversationStatus,
} from "@plugins/conversations/shared";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { cn } from "@/lib/utils";
import { Item } from "../slots";

export { formatRelativeTime };

function ChipsSlot({ conv }: { conv: ConversationItemConv }) {
  const items = Item.Chips.useContributions();
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => {
        const Component = item.component;
        return <Component key={i} conv={conv} />;
      })}
    </>
  );
}

export const CONV_STATUS_DOT: Record<ConversationStatus, string> = {
  starting: "bg-muted-foreground/60",
  working: "bg-[oklch(0.58_0.1_240)]",
  waiting: "bg-amber-500",
  gone: "bg-muted-foreground/40",
};

// Structural prop type — accepts both the full `Conversation` and the
// narrower `ConversationSummary` carried by `attemptsResource`. Anything
// with these fields renders.
export type ConversationItemConv = {
  id: string;
  title: string | null;
  status: ConversationStatus;
  kind: ConversationKind;
  createdAt: Date;
  spawnedBy?: string | null;
};

export type ConversationItemProps = {
  conv: ConversationItemConv;
  layout?: "block" | "inline";
};

export function ConvStatusDot({ conv }: { conv: ConversationItemConv }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        CONV_STATUS_DOT[conv.status],
      )}
    />
  );
}

export function ConvSysBadge({ conv }: { conv: ConversationItemConv }) {
  if (conv.kind !== "system") return null;
  return (
    <span className="shrink-0 rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground/80">
      sys
    </span>
  );
}

export function ConvTitle({ conv }: { conv: ConversationItemConv }) {
  const muted = conv.status === "gone";
  return (
    <span
      className={cn(
        "truncate text-xs",
        muted ? "text-muted-foreground" : "font-medium",
      )}
    >
      {conv.title ?? "Starting…"}
    </span>
  );
}

export function ConvRelativeTime({ conv }: { conv: ConversationItemConv }) {
  const isSystem = conv.kind === "system";
  const time = formatRelativeTime(conv.createdAt);
  return (
    <span className="truncate text-[10px] tabular-nums text-muted-foreground">
      {isSystem && conv.spawnedBy ? `${conv.spawnedBy} · ${time}` : time}
    </span>
  );
}

export function ConversationItem({
  conv,
  layout = "block",
}: ConversationItemProps) {
  if (layout === "inline") {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <ConvStatusDot conv={conv} />
        <ConvTitle conv={conv} />
        <ConvSysBadge conv={conv} />
        <ChipsSlot conv={conv} />
      </span>
    );
  }
  return (
    <div className="flex items-start gap-2 overflow-hidden">
      <span className="mt-1.5">
        <ConvStatusDot conv={conv} />
      </span>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <ConvTitle conv={conv} />
          <ConvSysBadge conv={conv} />
          <ChipsSlot conv={conv} />
        </div>
        <ConvRelativeTime conv={conv} />
      </div>
    </div>
  );
}
