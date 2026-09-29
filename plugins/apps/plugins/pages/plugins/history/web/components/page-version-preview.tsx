import { useMemo } from "react";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { getVersion } from "@plugins/history/plugins/engine/core";
import { pageBlocks } from "@plugins/page/plugins/editor/core";
import { BLOCK_INSET, PageIcon } from "@plugins/page/plugins/editor/web";
import { ReadOnlyBlocks } from "@plugins/page/plugins/read-only-view/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  buildForest,
  buildDiff,
  type PageSnapshot,
} from "../internal/build-diff";
import { isSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const descriptionIcon = symbol("description");

/**
 * Faithful read-only preview of one page version, with per-block diff
 * highlighting against the current page. Fetches the version's snapshot and
 * reads the live current blocks; the snapshot is rendered via `ReadOnlyBlocks`
 * with a diff map computed by stable id then content fallback (see build-diff).
 */
export function PageVersionPreview({
  pageId,
  versionId,
}: {
  pageId: string;
  versionId: string;
}) {
  const version = useEndpoint(getVersion, {
    sourceId: "pages",
    entityId: pageId,
    versionId,
  });
  const current = useLive(pageBlocks, { pageId });

  const snap = version.data?.snapshot as PageSnapshot | undefined;

  const forest = useMemo(
    () => (snap ? buildForest(snap.blocks, pageId) : []),
    [snap, pageId],
  );

  // Gate on both async sources: the diff requires the current blocks settled,
  // and collapsing `pending` into `[]` would render a confidently-wrong diff
  // during the load window (banned by live-state/no-pending-data-collapse).
  if (current.status === "error") {
    return (
      <ResourceErrorInline
        variant="block"
        subject="the current page"
        error={current.error}
        refetch={current.refetch}
      />
    );
  }
  if (version.isLoading || current.status === "loading") {
    return <Loading variant="rows" count={6} />;
  }
  if (!snap) {
    return (
      <Placeholder tone="error">This version could not be loaded.</Placeholder>
    );
  }

  const diff = buildDiff(snap.blocks, current.data);

  const savedIcon = snap.page.icon;
  const icon =
    typeof savedIcon === "string" && isSavedSymbolName(savedIcon)
      ? savedIcon
      : null;

  return (
    <Stack gap="md">
      {/* Icon + title are chrome, not blocks: they sit on the block content
          edge (`C + BLOCK_INSET`), while `ReadOnlyBlocks` stays flush at `C`. */}
      <Inset x={BLOCK_INSET}>
        <Line className="gap-sm">
          <PageIcon icon={icon} fallback={descriptionIcon} className="size-6" />
          <Text as="h2" variant="title">
            {snap.page.title || "Untitled"}
          </Text>
        </Line>
      </Inset>
      {forest.length > 0 ? (
        <ReadOnlyBlocks forest={forest} diff={diff} />
      ) : (
        <Placeholder tone="muted">This version had no content.</Placeholder>
      )}
    </Stack>
  );
}
