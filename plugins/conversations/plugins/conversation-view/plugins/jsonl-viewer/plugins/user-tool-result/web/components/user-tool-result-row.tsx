import type { JsonlEvent } from "../../../../shared";
import { formatTime } from "../../../../web/utils";

type UserToolResultEvent = Extract<JsonlEvent, { kind: "user-tool-result" }>;

export function UserToolResultRow({ event }: { event: JsonlEvent }) {
  const e = event as UserToolResultEvent;
  const borderClass = e.isError ? "border-destructive/60" : "border-border/60";
  const bgClass = e.isError ? "bg-destructive/5" : "bg-muted/20";
  return (
    <details className={`rounded-md border ${borderClass} ${bgClass} px-3 py-2`}>
      <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
            e.isError
              ? "bg-destructive/15 text-destructive"
              : "bg-muted text-muted-foreground"
          }`}
        >
          tool_result{e.isError ? " · error" : ""}
        </span>
        <span className="ml-auto tabular-nums">{formatTime(e.at)}</span>
      </summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-xs">
        {e.content || "(empty)"}
      </pre>
    </details>
  );
}
