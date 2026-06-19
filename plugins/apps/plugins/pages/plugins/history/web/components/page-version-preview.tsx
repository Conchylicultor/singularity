import { useMemo } from "react";
import { MdDescription } from "react-icons/md";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { getVersion } from "@plugins/history/plugins/engine/core";
import { blocksResource } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { ReadOnlyBlocks } from "@plugins/page/plugins/read-only-view/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { buildForest, buildDiff, type PageSnapshot } from "../internal/build-diff";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/web";

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
  const version = useEndpoint(getVersion, { sourceId: "pages", entityId: pageId, versionId });
  const current = useResource(blocksResource, { pageId });

  const snap = version.data?.snapshot as PageSnapshot | undefined;

  const forest = useMemo(
    () => (snap ? buildForest(snap.blocks, pageId) : []),
    [snap, pageId],
  );

  // Gate on both async sources: the diff requires the current blocks settled,
  // and collapsing `pending` into `[]` would render a confidently-wrong diff
  // during the load window (banned by live-state/no-pending-data-collapse).
  if (version.isLoading || current.pending) {
    return <Loading variant="rows" count={6} />;
  }
  if (!snap) {
    return <Placeholder tone="error">This version could not be loaded.</Placeholder>;
  }

  const diff = buildDiff(snap.blocks, current.data);

  const iconNodes = Array.isArray(snap.page.iconSvgNodes)
    ? (snap.page.iconSvgNodes as SvgNode[])
    : null;

  return (
    <Stack gap="md">
      <Frame
        gap="sm"
        leading={<PageIcon nodes={iconNodes} fallback={MdDescription} className="size-6" />}
        content={
          <TruncatingText as="h2" className="text-title">
            {snap.page.title || "Untitled"}
          </TruncatingText>
        }
      />
      {forest.length > 0 ? (
        <ReadOnlyBlocks forest={forest} diff={diff} />
      ) : (
        <Placeholder tone="muted">This version had no content.</Placeholder>
      )}
    </Stack>
  );
}
