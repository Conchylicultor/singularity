import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { agentReportPane } from "../panes";

interface AgentInput {
  description?: string;
}

export function AgentReportPaneBody() {
  const { toolUseId } = agentReportPane.useParams();
  const convId = conversationPane.useRouteEntry()?.params.convId;
  const eventsResult = useResource(jsonlEventsResource, {
    id: convId ?? "",
  });

  if (eventsResult.pending) {
    return (
      <PaneChrome pane={agentReportPane} title="Agent Report">
        <Loading />
      </PaneChrome>
    );
  }

  const event = eventsResult.data.find(
    (e) => e.kind === "tool-call" && e.toolUseId === toolUseId,
  );

  const result = event?.kind === "tool-call" ? event.result : null;
  const input =
    event?.kind === "tool-call" ? (event.input as AgentInput) : null;
  const title = input?.description ?? "Agent Report";

  return (
    <PaneChrome pane={agentReportPane} title={title}>
      <Inset pad="lg">
        {!result ? (
          <Text as="div" variant="body" className="text-muted-foreground">
            {!event ? "Event not found." : "Agent is still running…"}
          </Text>
        ) : result.isError ? (
          <Text
            as="pre"
            variant="body"
            className="whitespace-pre-wrap break-words text-destructive"
          >
            {result.content}
          </Text>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{result.content}</Markdown>
          </div>
        )}
      </Inset>
    </PaneChrome>
  );
}
