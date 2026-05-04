import type { ToolRendererProps } from "../../shared";

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function GenericToolView({ event }: ToolRendererProps) {
  return (
    <>
      {event.input != null && (
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted/60 p-2 text-xs">
          {formatJson(event.input)}
        </pre>
      )}
      {event.result && (
        <pre
          className={`mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded p-2 text-xs ${
            event.result.isError
              ? "bg-destructive/10 text-destructive"
              : "bg-muted/60"
          }`}
        >
          {event.result.content || "(empty)"}
        </pre>
      )}
    </>
  );
}
