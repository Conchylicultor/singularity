import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  ValueBlock,
  CollapsibleValue,
} from "@plugins/apps/plugins/workflows/plugins/engine/web";
import type {
  WorkflowExecution,
  WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";

/**
 * Execution body for the http-request step: the request line (method + url),
 * the response status, headers, and parsed body.
 */
export function HttpRequestExecution({
  step,
}: {
  step: WorkflowExecutionStep;
  execution: WorkflowExecution;
}) {
  const out = step.output as {
    status?: number;
    ok?: boolean;
    headers?: Record<string, string>;
    body?: unknown;
  } | null;
  const config = (step.config ?? {}) as { method?: string; url?: string };

  return (
    <Stack gap="sm">
      <Stack as="div" direction="row" align="center" gap="xs">
        <Badge mono>{(config.method ?? "GET").toUpperCase()}</Badge>
        <Text as="span" variant="caption" className="truncate text-muted-foreground">
          {config.url}
        </Text>
      </Stack>

      {out ? (
        <Stack as="div" direction="row" align="center" gap="xs">
          <Badge variant={out.ok ? "success" : "destructive"} mono>
            {String(out.status)}
          </Badge>
          <Text variant="caption" tone="muted">{out.ok ? "OK" : "Error"}</Text>
        </Stack>
      ) : null}

      {out ? <CollapsibleValue label="Response headers" value={out.headers} /> : null}

      {out ? (
        <Stack gap="2xs">
          <Text variant="caption" tone="muted">Response body</Text>
          <ValueBlock value={out.body} />
        </Stack>
      ) : null}
    </Stack>
  );
}
