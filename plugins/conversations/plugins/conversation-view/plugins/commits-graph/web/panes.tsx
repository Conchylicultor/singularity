import { Pane, PaneChrome, type } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { CommitsGraphBody } from "./components/commits-graph-body";
import { CommitDiffView } from "./components/commit-diff-view";

export const convCommitsGraphPane = Pane.define({
  id: "conv-commits-graph",
  segment: "commits",
  input: type<{ convId: string }>(),
  component: ConvCommitsGraphBody,
  width: 520,
});

export const convCommitDiffPane = Pane.define({
  id: "conv-commit-diff",
  defaultAncestors: [convCommitsGraphPane],
  segment: "d/:sha",
  input: type<{ convId: string }>(),
  component: ConvCommitDiffBody,
  width: 720,
  resolve: false,
});

function ConvCommitsGraphBody() {
  return (
    <PaneChrome pane={convCommitsGraphPane} title="Commits">
      <CommitsGraphBody />
    </PaneChrome>
  );
}

function ConvCommitDiffBody() {
  const { convId: inputConvId } = convCommitDiffPane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const { sha } = convCommitDiffPane.useParams();
  if (!conversation) return null;
  return (
    <PaneChrome
      pane={convCommitDiffPane}
      title={<span className="font-mono">{sha.slice(0, 7)}</span>}
    >
      <CommitDiffView worktree={conversation.attemptId} sha={sha} />
    </PaneChrome>
  );
}
