import type { JsonlEvent } from "../../../../shared";
import { formatTime } from "../../../../web/utils";

type AssistantToolUseEvent = Extract<JsonlEvent, { kind: "assistant-tool-use" }>;

function formatInput(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function AssistantToolUseRow({ event }: { event: JsonlEvent }) {
  const e = event as AssistantToolUseEvent;
  return (
    <details className="group rounded-md border border-border/60 bg-background px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
          tool_use
        </span>
        <span className="font-mono text-foreground">{e.name || "(unnamed)"}</span>
        <span className="ml-auto tabular-nums">{formatTime(e.at)}</span>
      </summary>
      <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted/60 p-2 text-xs">
        {formatInput(e.input)}
      </pre>
    </details>
  );
}
