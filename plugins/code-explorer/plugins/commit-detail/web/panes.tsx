import type { ReactNode } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { CommitDiffView } from "./components/commit-diff-view";
import { useCommitInfo, type CommitInfoState } from "./use-commit-info";

const commitDetailRoute = defineRoute({
  id: "commit-detail",
  segment: "commit/:worktree/:sha",
});

export const commitDetailPane = Pane.define({
  route: commitDetailRoute,
  app: agentManagerApp,
  component: CommitDetailBody,
  chrome: { history: false },
  width: 720,
  // A git sha is not an app entity the router can validate.
  resolve: false,
});

function CommitDetailBody() {
  // Both params come from this pane's own route entry — no ancestor
  // conversation lookup, which is what lets any surface push it.
  const { worktree, sha } = commitDetailPane.useParams();
  const info = useCommitInfo(worktree, sha);

  return (
    <PaneChrome pane={commitDetailPane} title={commitTitle(info, sha)}>
      {info.kind === "not-found" ? (
        <Placeholder>{info.reason}</Placeholder>
      ) : (
        <CommitDiffView worktree={worktree} sha={sha} />
      )}
    </PaneChrome>
  );
}

// The subject once resolved; the short sha while loading, unknown, or
// unreachable — a metadata failure must not cost the pane its identity.
function commitTitle(info: CommitInfoState, sha: string): ReactNode {
  if (info.kind === "found") return info.commit.subject;
  return <span className="font-mono">{sha.slice(0, 7)}</span>;
}
