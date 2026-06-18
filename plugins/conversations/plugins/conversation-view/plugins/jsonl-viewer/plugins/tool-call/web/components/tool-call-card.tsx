import { type ReactNode } from "react";
import type { ToolCallEvent } from "../../core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
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
        <Frame
          gap="sm"
          // The label is the flexible (flex-1 min-w-0) leaf of collapsible-card's
          // externally-owned content flex; Frame owns the rigid|truncate hierarchy
          // internally. This wrapper class folds away once collapsible-card's own
          // row is drained to Frame slots.
          // eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of collapsible-card's not-yet-drained content flex
          className="min-w-0 flex-1"
          leading={
            <>
              <Badge
                size="sm"
                colorClass={
                  hasError
                    ? "bg-destructive/15 text-destructive"
                    : "bg-primary/10 text-primary"
                }
                className="font-mono"
              >
                {event.name || "tool_call"}
              </Badge>
              {/* Interactive chip sits inside the (click-through) label, so it
                  opts back into pointer events via CardHeaderAction. */}
              {leading && <CardHeaderAction>{leading}</CardHeaderAction>}
            </>
          }
          content={
            // We pre-wrap a string summary in TruncatingText (rather than letting
            // Frame auto-wrap it) only to add the `opacity-70` dim. TruncatingText
            // truncates regardless of parent display context, so no `as="div"`
            // workaround is needed here.
            summary == null ? undefined : typeof summary === "string" ? (
              <TruncatingText className="opacity-70">{summary}</TruncatingText>
            ) : (
              <span className="opacity-70">{summary}</span>
            )
          }
        />
      }
    >
      {children}
    </CollapsibleCard>
  );
}
