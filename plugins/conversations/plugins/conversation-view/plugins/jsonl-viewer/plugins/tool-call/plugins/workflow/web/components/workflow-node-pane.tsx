import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { workflowNodePane } from "../panes";
import { useWorkflowTrace } from "../internal/use-workflow-trace";

interface WorkflowInput {
  script?: string;
  args?: unknown;
}

export function WorkflowNodePaneBody() {
  const { toolUseId, nodeId } = workflowNodePane.useParams();
  const { convId: inputConvId } = workflowNodePane.useInput();
  const chainEntry = conversationPane.useChainEntry();
  const convId = inputConvId ?? chainEntry?.params.convId;

  const eventsResult = useResource(jsonlEventsResource, { id: convId ?? "" });
  const events = eventsResult.pending ? [] : eventsResult.data;
  const event = events?.find(
    (e) => e.kind === "tool-call" && e.toolUseId === toolUseId,
  );
  const input =
    event?.kind === "tool-call" ? (event.input as WorkflowInput) : null;

  const { graph, status } = useWorkflowTrace(input?.script ?? "", input?.args);
  const node = graph?.nodes.find((n) => n.id === nodeId);

  const title = node?.label ?? "Workflow step";

  return (
    <PaneChrome pane={workflowNodePane} title={title}>
      <div className="space-y-3 p-4">
        {!node ? (
          <div className="text-sm text-muted-foreground">
            {status === "tracing" ? "Parsing workflow…" : "Step not found."}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {node.phase && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                  {node.phase}
                </span>
              )}
              {node.model && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono capitalize text-muted-foreground">
                  {node.model}
                </span>
              )}
              {node.agentType && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                  {node.agentType}
                </span>
              )}
              {node.hasSchema && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                  schema
                </span>
              )}
            </div>
            {node.deps.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
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
      </div>
    </PaneChrome>
  );
}
