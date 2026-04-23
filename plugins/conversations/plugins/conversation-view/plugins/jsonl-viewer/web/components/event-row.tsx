import type { JsonlEvent } from "../../shared";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatInput(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function EventRow({ event }: { event: JsonlEvent }) {
  const time = formatTime(event.at);

  if (event.kind === "user-text") {
    return (
      <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>User</span>
          <span className="tabular-nums">{time}</span>
        </div>
        <div className="whitespace-pre-wrap break-words text-sm">{event.text}</div>
      </div>
    );
  }

  if (event.kind === "assistant-text") {
    return (
      <div className="rounded-md border border-border/60 bg-background px-3 py-2">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Assistant</span>
          <span className="tabular-nums">{time}</span>
          {event.stopReason ? (
            <span className="ml-auto text-muted-foreground/70">{event.stopReason}</span>
          ) : null}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm">{event.text}</div>
      </div>
    );
  }

  if (event.kind === "assistant-tool-use") {
    return (
      <details className="group rounded-md border border-border/60 bg-background px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
            tool_use
          </span>
          <span className="font-mono text-foreground">{event.name || "(unnamed)"}</span>
          <span className="ml-auto tabular-nums">{time}</span>
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted/60 p-2 text-xs">
          {formatInput(event.input)}
        </pre>
      </details>
    );
  }

  if (event.kind === "user-tool-result") {
    const borderClass = event.isError ? "border-destructive/60" : "border-border/60";
    const bgClass = event.isError ? "bg-destructive/5" : "bg-muted/20";
    return (
      <details className={`group rounded-md border ${borderClass} ${bgClass} px-3 py-2`}>
        <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
              event.isError
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            tool_result{event.isError ? " · error" : ""}
          </span>
          <span className="ml-auto tabular-nums">{time}</span>
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 text-xs">
          {event.content || "(empty)"}
        </pre>
      </details>
    );
  }

  if (event.kind === "system") {
    return (
      <div className="px-1 text-xs italic text-muted-foreground">
        <span className="mr-2 tabular-nums">{time}</span>
        <span className="mr-2 font-mono">
          system{event.subtype ? `:${event.subtype}` : ""}
        </span>
        <span>{event.text}</span>
      </div>
    );
  }

  // summary
  return (
    <div className="my-2 flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span className="font-medium">{event.text}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
