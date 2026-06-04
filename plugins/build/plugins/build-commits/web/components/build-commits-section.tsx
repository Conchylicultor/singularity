import type { ReactElement } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { CommitRowItem } from "@plugins/primitives/plugins/commit-list/web";
import { getBuildRunCommits } from "../../shared";

const BRANCH_COLOR = "var(--primary)";

export function BuildCommitsSection({ runId }: { runId: string }): ReactElement {
  const { data, isPending, isError } = useEndpoint(getBuildRunCommits, { id: runId });

  if (isPending) return <Placeholder>Loading commits...</Placeholder>;
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
