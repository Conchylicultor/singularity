import { type ReactNode } from "react";
import type { ToolCallEvent } from "../../core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import {
  CollapsibleCard,
  CardHeaderAction,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";

interface ToolCallCardProps {
  event: ToolCallEvent;
  summary?: ReactNode;
  /** Interactive chip rendered right after the tool-name badge and before the
   *  summary — e.g. a skill-name chip. Wrapped in `<CardHeaderAction>` so it
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
      error={hasError}
      defaultOpen={defaultOpen}
      aside={aside}
      trailing={isRunning ? <BouncingDots size="sm" /> : undefined}
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
              back into pointer events via CardHeaderAction to keep its onClick. */}
          {leading && <CardHeaderAction className="shrink-0">{leading}</CardHeaderAction>}
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
