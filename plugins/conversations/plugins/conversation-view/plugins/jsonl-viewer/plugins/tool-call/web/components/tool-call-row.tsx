import { useState } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";
import {
  TokenBadge,
  formatTime,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { JsonlViewerTool } from "../slots";
import type { ToolCallEvent } from "../../shared";
import { GenericToolView } from "./generic-tool-view";

function resolveContribution(
  event: ToolCallEvent,
  contributions: ReturnType<typeof JsonlViewerTool.Renderer.useContributions>,
) {
  const exact = contributions.find((c) => c.name != null && c.name === event.name);
  if (exact) return exact;

  const pattern = contributions.find(
    (c) => c.pattern != null && c.pattern.test(event.name),
  );
  if (pattern) return pattern;

  return null;
}

function inputDescription(input: unknown): string {
  if (typeof input !== "object" || input === null || !("description" in input)) return "";
  const desc = (input as Record<string, unknown>).description;
  return typeof desc === "string" ? desc : "";
}

export function ToolCallRow({ event }: { event: JsonlEvent }) {
  const e = event as ToolCallEvent;
  const contributions = JsonlViewerTool.Renderer.useContributions();
  const contribution = resolveContribution(e, contributions);
  const Renderer = contribution?.component ?? GenericToolView;
  const Summary = contribution?.summary;

  const [open, setOpen] = useState(contribution?.defaultOpen ?? false);

  const hasError = e.result?.isError;
  const isRunning = !e.result;
  const description = inputDescription(e.input);
  const hasInlineLabel = !!(Summary || description);
  const borderClass = hasError ? "border-destructive/60" : "border-border/60";
  const bgClass = hasError ? "bg-destructive/5" : "bg-background";

  return (
    <details
      className={`group rounded-md border ${borderClass} ${bgClass} px-3 py-2`}
      open={open}
      onToggle={(ev) => setOpen((ev.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] ${
            hasError
              ? "bg-destructive/15 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {e.name || "tool_call"}
        </span>
        {Summary
          ? <Summary event={e} />
          : (description && <span className="min-w-0 flex-1 truncate opacity-70">{description}</span>)
        }
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
        {e.result && !hasError && (
          <span className="text-[11px] text-green-600 dark:text-green-400">✓</span>
        )}
        {hasError && (
          <span className="shrink-0 text-[11px] text-destructive">✗</span>
        )}
        <span className={`flex shrink-0 items-center gap-2 ${hasInlineLabel ? "" : "ml-auto"}`}>
          {e.usage ? <TokenBadge usage={e.usage} /> : null}
          <span className="tabular-nums">{formatTime(e.at)}</span>
        </span>
      </summary>
      <Renderer event={e} />
    </details>
  );
}
