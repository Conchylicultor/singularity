import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { CommitsGraphBody } from "./components/commits-graph-body";
import { CommitDiffView } from "./components/commit-diff-view";

export const convCommitsGraphPane = Pane.define({
  id: "conv-commits-graph",
  parent: conversationPane,
  path: "commits",
  component: ConvCommitsGraphBody,
  width: 520,
});

export const convCommitDiffPane = Pane.define({
  id: "conv-commit-diff",
  parent: convCommitsGraphPane,
  path: ":sha",
  component: ConvCommitDiffBody,
  width: 720,
});

function ConvCommitsGraphBody() {
  return (
    <PaneChrome pane={convCommitsGraphPane} title="Commits">
      <CommitsGraphBody />
    </PaneChrome>
  );
}

function ConvCommitDiffBody() {
  const { conversation } = conversationPane.useData();
  const { sha } = convCommitDiffPane.useParams();
  return (
    <PaneChrome
      pane={convCommitDiffPane}
      title={<span className="font-mono">{sha.slice(0, 7)}</span>}
    >
      <CommitDiffView worktree={conversation.attemptId} sha={sha} />
    </PaneChrome>
  );
}
