import { useMemo } from "react";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";

type TaskListResult = Array<{ id?: string; description?: string; status?: string }>;

function parseResult(event: ToolRendererProps["event"]): TaskListResult | null {
  if (!event.result?.content) return null;
  try {
    const parsed = JSON.parse(event.result.content);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return null;
  }
}

export function TaskListToolView({ event }: ToolRendererProps) {
  const tasks = useMemo(() => parseResult(event), [event]);
  const count = tasks?.length ?? 0;

  const summary = (
    <span className="tabular-nums">{count} task{count !== 1 ? "s" : ""}</span>
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {tasks && tasks.length > 0 && (
        <Scroll
          // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the task list from the card header
          className="mt-2 max-h-[200px]"
        >
          <Stack gap="xs">
            {tasks.map((t, i) => (
              <Frame
                key={t.id ?? i}
                gap="sm"
                className="text-2xs text-muted-foreground"
                leading={
                  t.id || t.status ? (
                    <>
                      {t.id && <span className="font-mono">{t.id}</span>}
                      {t.status && (
                        <Badge variant="muted" size="sm">
                          {formatStatusLabel(t.status)}
                        </Badge>
                      )}
                    </>
                  ) : undefined
                }
                content={t.description || undefined}
              />
            ))}
          </Stack>
        </Scroll>
      )}
      {event.result?.isError && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the error text from the card header
        <Text as="p" variant="caption" className="mt-2 text-destructive">
          {event.result.content}
        </Text>
      )}
    </ToolCallCard>
  );
}
