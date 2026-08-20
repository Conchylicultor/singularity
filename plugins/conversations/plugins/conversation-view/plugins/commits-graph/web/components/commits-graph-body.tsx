import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  MergeBaseMarker,
  CommitRowItem,
} from "@plugins/primitives/plugins/commit-list/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Separator } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { commitDetailPane } from "@plugins/code-explorer/plugins/commit-detail/web";
import { commitsGraphResource } from "../../shared/resources";

const BRANCH_COLOR = "var(--primary)";
const LANDED_COLOR = "#10b981"; // emerald-500 — commits pushed to main
const MAIN_COLOR = "var(--muted-foreground)";
const BEHIND_COLOR =
  "color-mix(in srgb, var(--muted-foreground) 50%, transparent)";

export function CommitsGraphBody() {
  const openPane = useOpenPane();
  const convId = conversationPane.useRouteEntry()?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const result = useResource(commitsGraphResource, {
    attemptId: conversation?.attemptId ?? "",
  });

  if (!conversation) return null;
  // A settled result no longer carries `.error` (the value it exposes is one the
  // server currently vouches for). A transient load failure surfaces as
  // `pending` with `.error` set, so the error placeholder lives inside the
  // pending arm — checked before the plain `<Loading/>`.
  if (result.pending) {
    if (result.error) {
      return (
        <Placeholder tone="error">
          Failed to load commits: {String(result.error)}
        </Placeholder>
      );
    }
    return <Loading />;
  }
  const graph = result.data;
  // No worktree to measure ⇒ a determinate non-value; render its reason.
  if (!graph.resolved) {
    return <Placeholder>{graph.reason}</Placeholder>;
  }
  if (graph.value.mergeBase === null) {
    return (
      <Placeholder>
        No shared history with <span className="font-mono">main</span>.
      </Placeholder>
    );
  }

  const {
    commits,
    landedCommits: landed,
    behindCommits: behind_,
    ahead,
    behind,
    branch,
    mergeBase,
  } = graph.value;
  const landedCommits = landed;
  const behindCommits = behind_;
  const branchLabel = branch ?? "HEAD";
  const hasAgentWork = commits.length > 0 || landedCommits.length > 0;
  // The detail pane carries the worktree in its own params, so this is the only
  // place the conversation's attempt enters the picture.
  const openCommit = (sha: string) =>
    openPane(
      commitDetailPane,
      { worktree: conversation.attemptId, sha },
      { mode: "push" },
    );

  return (
    <Column
      fill
      className="h-full"
      header={
        <Text
          as="header"
          variant="caption"
          className="border-b border-border px-lg py-sm text-muted-foreground"
        >
          <Stack direction="row" gap="sm" align="baseline">
            <span className="font-mono text-foreground">{branchLabel}</span>
            <span>↑{ahead}</span>
            {behind > 0 ? (
              <span className="text-warning">↓{behind}</span>
            ) : null}
            {/* An empty Fill absorbs the slack, so "vs main" sits flush right in its own track. */}
            <Fill />
            <span>vs main</span>
          </Stack>
        </Text>
      }
      body={
        <ol>
          {commits.map((commit, idx) => (
            <CommitRowItem
              key={commit.sha}
              commit={commit}
              isFirst={idx === 0}
              isLast={idx === commits.length - 1}
              color={BRANCH_COLOR}
              onClick={(c) => openCommit(c.sha)}
            />
          ))}
          {hasAgentWork && (
            <MergeBaseMarker
              color={BRANCH_COLOR}
              mainColor={landedCommits.length > 0 ? LANDED_COLOR : MAIN_COLOR}
              shortSha={mergeBase ? mergeBase.slice(0, 7) : null}
              hasPending={commits.length > 0}
            />
          )}
          {landedCommits.map((commit, idx) => (
            <CommitRowItem
              key={commit.sha}
              commit={commit}
              isFirst={false}
              isLast={idx === landedCommits.length - 1}
              color={LANDED_COLOR}
              pushed
              onClick={(c) => openCommit(c.sha)}
            />
          ))}
          {behindCommits.length > 0 && (
            <>
              <BehindSeparator count={behind} hasAgentWork={hasAgentWork} />
              {behindCommits.map((commit, idx) => (
                <CommitRowItem
                  key={commit.sha}
                  commit={commit}
                  isFirst={false}
                  isLast={idx === behindCommits.length - 1}
                  color={BEHIND_COLOR}
                  onClick={(c) => openCommit(c.sha)}
                />
              ))}
            </>
          )}
        </ol>
      }
    />
  );
}

function BehindSeparator({
  count,
  hasAgentWork,
}: {
  count: number;
  hasAgentWork: boolean;
}) {
  return (
    <li className="border-b border-border/50 px-md py-xs">
      <Separator
        label={hasAgentWork ? `↓${count} on main` : `${count} commits on main`}
      />
    </li>
  );
}
