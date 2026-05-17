import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { commitsGraphResource } from "../../shared/resources";
import type { CommitRow } from "../../shared/protocol";
import { CommitRail, MergeBaseMarker, COMMIT_ROW_HEIGHT } from "./commit-rail";
import { convCommitDiffPane } from "../panes";

const BRANCH_COLOR = "var(--primary)";
const LANDED_COLOR = "#10b981"; // emerald-500 — commits pushed to main
const MAIN_COLOR = "var(--muted-foreground)";
const BEHIND_COLOR = "color-mix(in srgb, var(--muted-foreground) 50%, transparent)";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function CommitsGraphBody() {
  const { conversation } = conversationPane.useData();
  const convId = conversation.id;
  const result = useResource(commitsGraphResource, {
    attemptId: conversation.attemptId,
  });

  if (result.error) {
    return (
      <Placeholder tone="error">Failed to load commits: {String(result.error)}</Placeholder>
    );
  }
  if (result.pending) return <Placeholder>Loading…</Placeholder>;
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
    <div className="flex h-full flex-col overflow-hidden text-sm">
      <header className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-foreground">{branchLabel}</span>
          <span>↑{ahead}</span>
          {behind > 0 ? (
            <span className="text-amber-500">↓{behind}</span>
          ) : null}
          <span className="ml-auto">vs main</span>
        </div>
      </header>
      <ol className="flex-1 overflow-auto">
        {commits.map((commit, idx) => (
          <CommitRowItem
            key={commit.sha}
            commit={commit}
            isFirst={idx === 0}
            isLast={idx === commits.length - 1}
            color={BRANCH_COLOR}
            convId={convId}
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
            convId={convId}
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
                convId={convId}
              />
            ))}
          </>
        )}
      </ol>
    </div>
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
    <li className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
      <div className="h-px flex-1 bg-border/60" />
      <span className="shrink-0 text-xs text-muted-foreground/60">
        {hasAgentWork
          ? `↓${count} on main`
          : `${count} commits on main`}
      </span>
      <div className="h-px flex-1 bg-border/60" />
    </li>
  );
}

function CommitRowItem({
  commit,
  isFirst,
  isLast,
  color,
  pushed = false,
  convId,
}: {
  commit: CommitRow;
  isFirst: boolean;
  isLast: boolean;
  color: string;
  pushed?: boolean;
  convId: string;
}) {
  const openPane = useOpenPane();
  return (
    <li
      className="flex cursor-pointer items-center gap-2 border-b border-border/50 pl-2 pr-3 hover:bg-accent/50"
      style={{ height: COMMIT_ROW_HEIGHT }}
      onClick={() => openPane(convCommitDiffPane, { convId, sha: commit.sha }, { mode: "push" })}
    >
      <CommitRail isFirst={isFirst} isLast={isLast} color={color} />
      <span
        className="font-mono text-xs text-muted-foreground"
        title={commit.sha}
      >
        {commit.shortSha}
      </span>
      <span className="flex-1 truncate" title={commit.subject}>
        {commit.subject}
      </span>
      {pushed && (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          pushed
        </span>
      )}
      <span className="hidden truncate text-xs text-muted-foreground sm:inline">
        {commit.authorName}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatRelative(commit.authoredAt)}
      </span>
    </li>
  );
}
