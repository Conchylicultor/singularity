import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CommitRow } from "../../core";
import { CommitRail, COMMIT_ROW_HEIGHT } from "./commit-rail";

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

export function CommitRowItem({
  commit,
  isFirst,
  isLast,
  color,
  pushed = false,
  onClick,
}: {
  commit: CommitRow;
  isFirst: boolean;
  isLast: boolean;
  color: string;
  pushed?: boolean;
  onClick?: (commit: CommitRow) => void;
}) {
  return (
    <li
      className={`flex items-center gap-sm border-b border-border/50 pl-sm pr-md${onClick ? " cursor-pointer hover:bg-accent/50" : ""}`}
      style={{ height: COMMIT_ROW_HEIGHT }}
      onClick={onClick ? () => onClick(commit) : undefined}
    >
      <CommitRail isFirst={isFirst} isLast={isLast} color={color} />
      <Text
        as="span"
        variant="caption"
        className="font-mono text-muted-foreground"
        title={commit.sha}
      >
        {commit.shortSha}
      </Text>
      <span className="min-w-0 flex-1 truncate" title={commit.subject}>
        {commit.subject}
      </span>
      {pushed && (
        <Badge variant="success" size="md" className="shrink-0">
          pushed
        </Badge>
      )}
      <Text
        as="span"
        variant="caption"
        className="hidden truncate text-muted-foreground sm:inline"
      >
        {commit.authorName}
      </Text>
      <Text
        as="span"
        variant="caption"
        className="shrink-0 text-muted-foreground tabular-nums"
      >
        {formatRelative(commit.authoredAt)}
      </Text>
    </li>
  );
}
