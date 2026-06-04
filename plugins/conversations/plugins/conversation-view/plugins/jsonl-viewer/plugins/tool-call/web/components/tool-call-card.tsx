import { type ReactNode } from "react";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import type { ToolCallEvent } from "../../core";
import { Badge } from "@plugins/primitives/plugins/badge/web";

interface ToolCallCardProps {
  event: ToolCallEvent;
  summary?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  /**
   * Override the error tone. When omitted, the card derives it from
   * `event.result?.isError`. Renderers whose protocol-level error is an expected
   * mechanism artifact (e.g. AskUserQuestion's cancel-to-flush interrupt) pass
   * `false` so the card is not styled as a failure.
   */
  isError?: boolean;
}

export function ToolCallCard({
  event,
  summary,
  children,
  defaultOpen = false,
  isError,
}: ToolCallCardProps) {
  const { open, triggerProps, contentId } = useCollapsible({ defaultOpen });
  const hasError = isError ?? event.result?.isError;
  const isRunning = !event.result;
  const borderClass = hasError ? "border-destructive/60" : "border-border/60";
  const bgClass = hasError ? "bg-destructive/5" : "bg-background";

  return (
    <div className={`group rounded-md border ${borderClass} ${bgClass} px-3 py-2`}>
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground"
      >
        <Badge
          size="sm"
          colorClass={hasError ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}
          className="shrink-0 font-mono"
        >
          {event.name || "tool_call"}
        </Badge>
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
      </button>
      {open && <div id={contentId}>{children}</div>}
    </div>
  );
}
