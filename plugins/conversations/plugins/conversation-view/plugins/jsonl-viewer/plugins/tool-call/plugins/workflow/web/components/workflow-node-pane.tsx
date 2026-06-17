import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { modelDisplayLabel } from "@plugins/conversations/plugins/model-provider/core";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { workflowNodePane } from "../panes";
import { useWorkflowTrace } from "../internal/use-workflow-trace";

interface WorkflowInput {
  script?: string;
  args?: unknown;
}

export function WorkflowNodePaneBody() {
  const { convId: inputConvId } = workflowNodePane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;

  const eventsResult = useResource(jsonlEventsResource, { id: convId ?? "" });

  if (eventsResult.pending) {
    return (
      <PaneChrome pane={workflowNodePane} title="Workflow step">
        <Loading />
      </PaneChrome>
    );
  }

  return <WorkflowNodePaneInner events={eventsResult.data} />;
}

function WorkflowNodePaneInner({ events }: { events: JsonlEvent[] }) {
  const { toolUseId, nodeId } = workflowNodePane.useParams();

  const event = events.find(
    (e) => e.kind === "tool-call" && e.toolUseId === toolUseId,
  );
  const input =
    event?.kind === "tool-call" ? (event.input as WorkflowInput) : null;

  const { graph, status } = useWorkflowTrace(input?.script ?? "", input?.args);
  const node = graph?.nodes.find((n) => n.id === nodeId);

  const title = node?.label ?? "Workflow step";

  return (
    <PaneChrome pane={workflowNodePane} title={title}>
      <Stack gap="md" className="p-lg">
        {!node ? (
          <Text as="div" variant="body" className="text-muted-foreground">
            {status === "tracing" ? "Parsing workflow…" : "Step not found."}
          </Text>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-xs text-2xs">
              {node.phase && (
                <Badge variant="muted" size="sm">
                  {node.phase}
                </Badge>
              )}
              {node.model && (
                <Badge variant="muted" size="sm" className="font-mono">
                  {modelDisplayLabel(node.model)}
                </Badge>
              )}
              {node.agentType && (
                <Badge variant="muted" size="sm">
                  {formatStatusLabel(node.agentType)}
                </Badge>
              )}
              {node.hasSchema && (
                <Badge variant="muted" size="sm">
                  Schema
                </Badge>
              )}
            </div>
            {node.deps.length > 0 && (
              <div className="text-2xs text-muted-foreground">
                Depends on:{" "}
                {node.deps
                  .map((d) => graph?.nodes.find((n) => n.id === d)?.label ?? d)
                  .join(", ")}
              </div>
            )}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown>{node.prompt}</Markdown>
            </div>
          </>
        )}
      </Stack>
    </PaneChrome>
  );
}
