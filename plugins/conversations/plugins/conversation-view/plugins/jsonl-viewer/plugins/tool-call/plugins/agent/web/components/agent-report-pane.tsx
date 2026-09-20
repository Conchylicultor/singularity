import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { SubagentPaneBody } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { agentReportPane } from "../panes";

/**
 * Route ownership only. The `agent` plugin knows which tool-use id the URL
 * names and which conversation it hangs off; everything about the sub-agent
 * itself — its state, its write-up, its transcript — belongs to the `subagents`
 * plugin, which owns the two resources behind it.
 */
export function AgentReportPaneBody() {
  const { toolUseId } = agentReportPane.useParams();
  const convId = conversationPane.useRouteEntry()?.params.convId;

  return (
    <PaneChrome pane={agentReportPane} title="Sub-agent">
      {convId === undefined ? (
        // A conversation-scoped satellite with no conversation above it: the
        // route was reached in a way this pane cannot serve. Say so rather than
        // subscribing to an empty conversation id and rendering "nothing yet".
        <Inset pad="lg">
          <Text as="div" variant="body" className="text-muted-foreground">
            This pane opens inside a conversation, and none is open here.
          </Text>
        </Inset>
      ) : (
        <SubagentPaneBody conversationId={convId} toolUseId={toolUseId} />
      )}
    </PaneChrome>
  );
}
