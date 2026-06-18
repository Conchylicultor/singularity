import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { MergeBaseMarker, CommitRowItem } from "@plugins/primitives/plugins/commit-list/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { commitsGraphResource } from "../../shared/resources";
import { convCommitDiffPane, convCommitsGraphPane } from "../panes";

const BRANCH_COLOR = "var(--primary)";
const LANDED_COLOR = "#10b981"; // emerald-500 — commits pushed to main
const MAIN_COLOR = "var(--muted-foreground)";
const BEHIND_COLOR = "color-mix(in srgb, var(--muted-foreground) 50%, transparent)";

export function CommitsGraphBody() {
  const openPane = useOpenPane();
  const { convId: inputConvId } = convCommitsGraphPane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const result = useResource(commitsGraphResource, {
    attemptId: conversation?.attemptId ?? "",
  });

  if (!conversation) return null;
  if (result.error) {
    return (
      <Placeholder tone="error">Failed to load commits: {String(result.error)}</Placeholder>
    );
  }
  if (result.pending) return <Loading />;
  if (result.data.mergeBase === null) {
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
  } = result.data;
  const landedCommits = landed;
  const behindCommits = behind_;
  const branchLabel = branch ?? "HEAD";
  const hasAgentWork = commits.length > 0 || landedCommits.length > 0;

  return (
    <Column
      fill
      className="h-full"
      header={
        <Text as="header" variant="caption" className="border-b border-border px-lg py-sm text-muted-foreground">
          <Frame
            leading={
              <>
                <span className="font-mono text-foreground">{branchLabel}</span>
                <span>↑{ahead}</span>
                {behind > 0 ? <span className="text-warning">↓{behind}</span> : null}
              </>
            }
            trailing={<span>vs main</span>}
          />
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
            onClick={(c) => openPane(convCommitDiffPane, { sha: c.sha }, { mode: "push", input: convId ? { convId } : undefined })}
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
            onClick={(c) => openPane(convCommitDiffPane, { sha: c.sha }, { mode: "push", input: convId ? { convId } : undefined })}
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
                onClick={(c) => openPane(convCommitDiffPane, { sha: c.sha }, { mode: "push", input: convId ? { convId } : undefined })}
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
    <Stack
      as="li"
      direction="row"
      gap="sm"
      align="center"
      className="border-b border-border/50 px-md py-xs"
    >
      {/* eslint-disable-next-line layout/no-adhoc-layout -- grow-to-fill hairline rule flanking the centered label; no primitive for a divider segment that absorbs slack on both sides of a label */}
      <div className="h-px grow bg-border/60" />
      <Text as="span" variant="caption" className="text-muted-foreground/60">
        {hasAgentWork
          ? `↓${count} on main`
          : `${count} commits on main`}
      </Text>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- grow-to-fill hairline rule flanking the centered label */}
      <div className="h-px grow bg-border/60" />
    </Stack>
  );
}

