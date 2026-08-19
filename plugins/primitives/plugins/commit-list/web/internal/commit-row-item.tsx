import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type React from "react";
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
  markers,
  onClick,
}: {
  commit: CommitRow;
  isFirst: boolean;
  isLast: boolean;
  color: string;
  pushed?: boolean;
  /**
   * Free-form chips pinned to this commit — "who is sitting on this commit".
   * The general form of `pushed`, which is one such marker hard-coded; both are
   * rendered, in their own track between the subject and the author.
   *
   * The caller owns the grouping (a `<Inline gap="2xs" className={rigidClass()}>`
   * of `<Badge>`s is the usual shape), so a row can carry one marker or five
   * without this primitive learning anything about what they mean.
   */
  markers?: React.ReactNode;
  onClick?: (commit: CommitRow) => void;
}) {
  return (
    <Stack
      as="li"
      direction="row"
      align="center"
      gap="sm"
      className={`border-b border-border/50 pl-sm pr-md${onClick ? " cursor-pointer hover:bg-accent/50" : ""}`}
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
      <Fill as="span" className="truncate" title={commit.subject}>
        {commit.subject}
      </Fill>
      {markers}
      {pushed && (
        <Badge variant="success" className={rigidClass()}>
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
        className={cn(rigidClass(), "text-muted-foreground tabular-nums")}
      >
        {formatRelative(commit.authoredAt)}
      </Text>
    </Stack>
  );
}
