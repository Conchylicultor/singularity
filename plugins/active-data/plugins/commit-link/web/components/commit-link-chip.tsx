import { MdCommit } from "react-icons/md";
import { commitDetailPane } from "@plugins/code-explorer/plugins/commit-detail/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import type { CommitRow } from "@plugins/primitives/plugins/commit-list/core";
import { COMMIT_WORKTREE } from "../internal/commit-worktree";

/**
 * Pure renderer, reachable ONLY on a claim — `value` is a commit the object
 * database resolved, so there is no "unknown sha" branch here and no hand-rolled
 * `<code>` fallback. When the token does not resolve, `useCommitClaim` declines
 * and the host's arbitration chain owns what renders instead.
 *
 * The `Inline` wrapper is the tooltip TRIGGER, not decoration: `WithTooltip`
 * clones its child with the trigger's own props and ref, and `LinkChip` has a
 * closed prop surface that would silently drop them. `Inline` forwards both to a
 * real inline-level `<span>`, baseline-aligned for a chip sitting in a text run.
 */
export function CommitLinkChip({
  content,
  value,
}: {
  content: string;
  value: CommitRow;
}) {
  const openPane = useOpenPane();

  return (
    <WithTooltip
      content={
        <Stack gap="2xs">
          <Text as="span" variant="caption">
            {value.subject}
          </Text>
          <Text as="span" variant="caption" tone="muted">
            {value.authorName} ·{" "}
            {formatRelativeTime(new Date(value.authoredAt))}
          </Text>
        </Stack>
      }
    >
      <Inline gap="none">
        <LinkChip
          onClick={(e) => {
            e.stopPropagation();
            // The FULL sha, not the abbreviation the author typed — the pane's
            // route param should name the object unambiguously.
            openPane(
              commitDetailPane,
              { worktree: COMMIT_WORKTREE, sha: value.sha },
              { mode: "push" },
            );
          }}
          leading={<MdCommit className="text-muted-foreground" />}
          mono
        >
          {content}
        </LinkChip>
      </Inline>
    </WithTooltip>
  );
}
