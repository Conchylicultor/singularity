import { type ReactNode } from "react";
import type { ToolCallEvent } from "../../core";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";

interface ToolCallCardProps {
  event: ToolCallEvent;
  summary?: ReactNode;
  /** Interactive chip rendered right after the tool-name badge and before the
   *  summary — e.g. a skill-name chip. It opts back into pointer events so it
   *  stays clickable while the rest of the row still toggles the card. */
  leading?: ReactNode;
  /** Sibling affordance next to (never inside) the trigger — e.g. a clickable
   *  FilePath. Interactive content belongs here, never in `summary`. */
  aside?: ReactNode;
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

function RunningDots() {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1 animate-bounce rounded-full bg-muted-foreground/40"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

export function ToolCallCard({
  event,
  summary,
  leading,
  aside,
  children,
  defaultOpen = false,
  isError,
}: ToolCallCardProps) {
  const hasError = isError ?? event.result?.isError;
  const isRunning = !event.result;
  return (
    <CollapsibleCard
      tone="tool"
      error={hasError}
      defaultOpen={defaultOpen}
      aside={aside}
      trailing={isRunning ? <RunningDots /> : undefined}
      label={
        <>
          <Badge
            size="sm"
            colorClass={
              hasError
                ? "bg-destructive/15 text-destructive"
                : "bg-primary/10 text-primary"
            }
            className="shrink-0 font-mono"
          >
            {event.name || "tool_call"}
          </Badge>
          {/* Interactive chip sits inside the (click-through) label, so it opts
              back into pointer events to keep its own onClick. */}
          {leading && (
            <span className="pointer-events-auto relative shrink-0">{leading}</span>
          )}
          {summary && (
            <span className="min-w-0 flex-1 truncate opacity-70">{summary}</span>
          )}
        </>
      }
    >
      {children}
    </CollapsibleCard>
  );
}
