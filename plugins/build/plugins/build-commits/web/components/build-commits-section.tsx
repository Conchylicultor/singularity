import type { ReactElement } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { buildHistoryResource } from "@plugins/build/core";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { CommitRowItem } from "@plugins/primitives/plugins/commit-list/web";
import { getBuildRunCommits } from "../../shared";

const BRANCH_COLOR = "var(--primary)";

export function BuildCommitsSection({ runId }: { runId: string }): ReactElement {
  // A composition child run (target !== "main") shares its parent main run's
  // commits, so there's nothing to fetch — look the run up on the already-live
  // history resource and short-circuit before the endpoint fetch. Gated on
  // `.pending` before deriving; the inner component's endpoint hook then runs
  // unconditionally with a settled run (same split as BuildButton/Inner).
  const historyResult = useResource(buildHistoryResource);
  if (historyResult.pending) return <Loading label="Loading commits…" />;
  const run = historyResult.data.find((r) => r.id === runId);
  if (run != null && run.target !== "main") {
    return <Placeholder>Commits belong to the parent build.</Placeholder>;
  }
  return <MainRunCommits runId={runId} />;
}

function MainRunCommits({ runId }: { runId: string }): ReactElement {
  const { data, isPending, isError } = useEndpoint(getBuildRunCommits, { id: runId });

  if (isPending) return <Loading label="Loading commits…" />;
  if (isError) return <Placeholder tone="error">Failed to load commits.</Placeholder>;
  if (data.length === 0) {
    return <Placeholder>No commits in this build.</Placeholder>;
  }

  return (
    <ol>
      {data.map((commit, idx) => (
        <CommitRowItem
          key={commit.sha}
          commit={commit}
          isFirst={idx === 0}
          isLast={idx === data.length - 1}
          color={BRANCH_COLOR}
        />
      ))}
    </ol>
  );
}
