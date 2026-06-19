import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
    <Frame
      as="li"
      gap="sm"
      className={`border-b border-border/50 pl-sm pr-md${onClick ? " cursor-pointer hover:bg-accent/50" : ""}`}
      style={{ height: COMMIT_ROW_HEIGHT }}
      onClick={onClick ? () => onClick(commit) : undefined}
      leading={
        <Stack direction="row" align="center" gap="sm">
          <CommitRail isFirst={isFirst} isLast={isLast} color={color} />
          <Text
            as="span"
            variant="caption"
            className="font-mono text-muted-foreground"
            title={commit.sha}
          >
            {commit.shortSha}
          </Text>
        </Stack>
      }
      content={commit.subject}
      trailing={
        <Stack direction="row" align="center" gap="sm">
          {pushed && (
            <Badge variant="success" size="md">
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
            className="text-muted-foreground tabular-nums"
          >
            {formatRelative(commit.authoredAt)}
          </Text>
        </Stack>
      }
    />
  );
}
