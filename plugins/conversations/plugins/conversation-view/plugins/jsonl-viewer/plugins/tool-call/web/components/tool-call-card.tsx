import { type ReactNode } from "react";
import type { ToolCallEvent } from "../../core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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
  /**
   * Override "is this call still in flight", which the card otherwise derives
   * from `event.result` being absent.
   *
   * For one tool family that derivation is simply wrong: a backgrounded `Agent`
   * gets its `tool_result` at LAUNCH, as an acknowledgement, so the card would
   * drop its running dots the instant a sub-agent starts and would show a
   * killed sub-agent as finished. A renderer that can actually answer the
   * question — because it reads the completion signal the harness really uses —
   * says so here, and the card believes it.
   */
  running?: boolean;
}

export function ToolCallCard({
  event,
  summary,
  leading,
  aside,
  children,
  defaultOpen = false,
  isError,
  running,
}: ToolCallCardProps) {
  const hasError = isError ?? event.result?.isError;
  const isRunning = running ?? !event.result;
  return (
    <CollapsibleCard
      error={hasError}
      defaultOpen={defaultOpen}
      summary={summary}
      aside={aside}
      trailing={isRunning ? <BouncingDots /> : undefined}
      label={
        // Rigid identity only: the tool-name badge + an optional leading chip.
        // The flexible `summary` rides the card's own flexible cell (passed as a
        // prop), not bundled here — so identity stays shrink-0 and never strands
        // the grow slot.
        <>
          <Badge
            colorClass={
              hasError
                ? "bg-destructive/15 text-destructive"
                : "bg-primary/10 text-primary"
            }
            className={cn(rigidClass(), "font-mono")}
          >
            {event.name || "tool_call"}
          </Badge>
          {/* Interactive chip sits inside the (click-through) label, so it opts
              back into pointer events via CardHeaderAction to keep its onClick. */}
          {leading && (
            <CardHeaderAction className={rigidClass()}>
              {leading}
            </CardHeaderAction>
          )}
        </>
      }
    >
      {children}
    </CollapsibleCard>
  );
}
