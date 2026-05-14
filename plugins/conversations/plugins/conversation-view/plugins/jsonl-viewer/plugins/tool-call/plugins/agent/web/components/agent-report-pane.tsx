import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { agentReportPane } from "../panes";

interface AgentInput {
  description?: string;
}

export function AgentReportPaneBody() {
  const { toolUseId } = agentReportPane.useParams();
  const { conversation } = conversationPane.useData();
  const { data: events } = useResource(jsonlEventsResource, {
    id: conversation.id,
  });

  const event = events?.find(
    (e) => e.kind === "tool-call" && e.toolUseId === toolUseId,
  );

  const result = event?.kind === "tool-call" ? event.result : null;
  const input =
    event?.kind === "tool-call" ? (event.input as AgentInput) : null;
  const title = input?.description ?? "Agent Report";

  return (
    <PaneChrome pane={agentReportPane} title={title}>
      <div className="h-full overflow-auto p-4">
        {!result ? (
          <div className="text-sm text-muted-foreground">
            {!event ? "Event not found." : "Agent is still running…"}
          </div>
        ) : result.isError ? (
          <pre className="whitespace-pre-wrap break-words text-sm text-destructive">
            {result.content}
          </pre>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{result.content}</Markdown>
          </div>
        )}
      </div>
    </PaneChrome>
  );
}
