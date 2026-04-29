import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { commitsGraphResource } from "../../shared/resources";
import type { CommitRow } from "../../shared/protocol";
import { CommitRail, MergeBaseMarker, COMMIT_ROW_HEIGHT } from "./commit-rail";

const BRANCH_COLOR = "var(--primary)";
const MAIN_COLOR = "var(--muted-foreground)";

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
  const { data, error } = useResource(commitsGraphResource, {
    attemptId: conversation.attemptId,
  });

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load commits: {String(error)}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading commits…</div>
    );
  }
  if (data.mergeBase === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No shared history with <span className="font-mono">main</span>.
      </div>
    );
  }

  const { commits, ahead, behind, branch, mergeBase } = data;
  const branchLabel = branch ?? "HEAD";

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
      {commits.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          Up to date with <span className="font-mono">main</span>.
        </div>
      ) : (
        <ol className="flex-1 overflow-auto">
          {commits.map((commit, idx) => (
            <CommitRowItem
              key={commit.sha}
              commit={commit}
              isFirst={idx === 0}
              isLast={idx === commits.length - 1}
            />
          ))}
          <MergeBaseMarker
            color={BRANCH_COLOR}
            mainColor={MAIN_COLOR}
            shortSha={mergeBase ? mergeBase.slice(0, 7) : null}
          />
        </ol>
      )}
    </div>
  );
}

function CommitRowItem({
  commit,
  isFirst,
  isLast,
}: {
  commit: CommitRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <li
      className="flex items-center gap-2 border-b border-border/50 pl-2 pr-3 hover:bg-accent/50"
      style={{ height: COMMIT_ROW_HEIGHT }}
    >
      <CommitRail isFirst={isFirst} isLast={isLast} color={BRANCH_COLOR} />
      <span
        className="font-mono text-xs text-muted-foreground"
        title={commit.sha}
      >
        {commit.shortSha}
      </span>
      <span className="flex-1 truncate" title={commit.subject}>
        {commit.subject}
      </span>
      <span className="hidden truncate text-xs text-muted-foreground sm:inline">
        {commit.authorName}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatRelative(commit.authoredAt)}
      </span>
    </li>
  );
}
