import type { ToolRendererProps } from "../../core";
import { ToolCallCard } from "./tool-call-card";
import { Text } from "@plugins/primitives/plugins/text/web";

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return String(value);
  }
}

function inputDescription(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || !("description" in input))
    return undefined;
  const desc = (input as Record<string, unknown>).description;
  return typeof desc === "string" ? desc : undefined;
}

export function GenericToolView({ event }: ToolRendererProps) {
  return (
    <ToolCallCard event={event} summary={inputDescription(event.input)}>
      {event.input != null && (
        <Text
          as="pre"
          variant="caption"
          className="mt-2 max-h-96 overflow-auto rounded-md bg-muted/60 p-2"
        >
          {formatJson(event.input)}
        </Text>
      )}
      {event.result && (
        <Text
          as="pre"
          variant="caption"
          className={`mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md p-2 ${
            event.result.isError
              ? "bg-destructive/10 text-destructive"
              : "bg-muted/60"
          }`}
        >
          {event.result.content || "(empty)"}
        </Text>
      )}
    </ToolCallCard>
  );
}
