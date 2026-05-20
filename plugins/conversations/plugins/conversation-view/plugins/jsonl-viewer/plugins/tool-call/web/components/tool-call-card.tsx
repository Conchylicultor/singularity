import { type ReactNode } from "react";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import { TokenBadge } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import type { ToolCallEvent } from "../../core";

interface ToolCallCardProps {
  event: ToolCallEvent;
  summary?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
}

export function ToolCallCard({
  event,
  summary,
  children,
  defaultOpen = false,
}: ToolCallCardProps) {
  const { open, triggerProps, contentId } = useCollapsible({ defaultOpen });
  const hasError = event.result?.isError;
  const isRunning = !event.result;
  const borderClass = hasError ? "border-destructive/60" : "border-border/60";
  const bgClass = hasError ? "bg-destructive/5" : "bg-background";

  return (
    <div className={`group rounded-md border ${borderClass} ${bgClass} px-3 py-2`}>
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground"
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] ${
            hasError
              ? "bg-destructive/15 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {event.name || "tool_call"}
        </span>
        {summary && (
          <span className="min-w-0 flex-1 truncate opacity-70">{summary}</span>
        )}
        {isRunning && (
          <span className="flex shrink-0 items-center gap-1">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1 animate-bounce rounded-full bg-muted-foreground/40"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        )}
        {event.usage ? (
          <span className={summary ? "" : "ml-auto"}>
            <TokenBadge usage={event.usage} />
          </span>
        ) : null}
      </button>
      {open && <div id={contentId}>{children}</div>}
    </div>
  );
}
