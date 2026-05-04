import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";
import {
  TokenBadge,
  formatTime,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { JsonlViewerTool } from "../slots";
import type { ToolCallEvent } from "../../shared";
import { GenericToolView } from "./generic-tool-view";

function resolveRenderer(
  event: ToolCallEvent,
  contributions: ReturnType<typeof JsonlViewerTool.Renderer.useContributions>,
) {
  // Tier 1: exact name match
  const exact = contributions.find((c) => c.name != null && c.name === event.name);
  if (exact) return exact.component;

  // Tier 2: first matching pattern
  const pattern = contributions.find(
    (c) => c.pattern != null && c.pattern.test(event.name),
  );
  if (pattern) return pattern.component;

  // Tier 3: built-in fallback
  return GenericToolView;
}

export function ToolCallRow({ event }: { event: JsonlEvent }) {
  const e = event as ToolCallEvent;
  const contributions = JsonlViewerTool.Renderer.useContributions();
  const Renderer = resolveRenderer(e, contributions);

  const hasError = e.result?.isError;
  const isRunning = !e.result;
  const borderClass = hasError
    ? "border-destructive/60"
    : "border-border/60";
  const bgClass = hasError ? "bg-destructive/5" : "bg-background";

  return (
    <details className={`group rounded-md border ${borderClass} ${bgClass} px-3 py-2`}>
      <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
            hasError
              ? "bg-destructive/15 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {e.name || "tool_call"}
        </span>
        {isRunning && (
          <span className="flex items-center gap-1">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1 animate-bounce rounded-full bg-muted-foreground/40"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        )}
        {hasError && (
          <span className="text-[11px] text-destructive">error</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {e.usage ? <TokenBadge usage={e.usage} /> : null}
          <span className="tabular-nums">{formatTime(e.at)}</span>
        </span>
      </summary>
      <Renderer event={e} />
    </details>
  );
}
