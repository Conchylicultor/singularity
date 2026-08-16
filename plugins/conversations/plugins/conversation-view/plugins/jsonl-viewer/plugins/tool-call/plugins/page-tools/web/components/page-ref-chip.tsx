import type React from "react";
import { MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { pageData, pagesResource } from "@plugins/page/plugins/editor/core";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

/** `block-7f1a2d3d-a3cd-…` → `7f1a2d3d…` — enough to recognize, short enough to sit in a header. */
function shortenBlockId(id: string): string {
  const body = id.startsWith("block-") ? id.slice("block-".length) : id;
  return body.length > 8 ? `${body.slice(0, 8)}…` : body;
}

/** The row's target as the only thing known about it: its id. */
function BlockIdBadge({ id }: { id: string }) {
  return (
    <Badge variant="muted" mono title={id}>
      {shortenBlockId(id)}
    </Badge>
  );
}

/**
 * Which page a page-tool call acted on — the identity affordance these rows
 * carry, as `FilePath` is for the file tools.
 *
 * Two arms, and the second is NOT an error path. The page tools write to the
 * shared instance while the viewer reads whichever instance it is served from,
 * so a worktree's stale DB fork routinely has no row for a page that exists;
 * and `blockId` may name a block *inside* a page rather than the page itself,
 * which the pages resource (pages only) will never carry. Either way the row
 * still has to name its target, so it falls back to the raw id.
 *
 * The same id is what it shows while the pages resource is still loading: the
 * id is known from the call itself and is never revised, so it is the honest
 * partial answer rather than a placeholder standing in for one.
 */
export function PageRefChip({
  pageId,
  blockId,
}: {
  pageId?: string;
  blockId?: string;
}) {
  const pagesResult = useResource(pagesResource);
  const openPane = useOpenPane();

  const id = pageId ?? blockId ?? "";
  // No id at all means the call carried no target — an empty chip would be
  // chrome standing in for information the row does not have.
  if (!id) return null;
  if (pagesResult.pending) return <BlockIdBadge id={id} />;

  const rows = pagesResult.data;
  const page =
    (pageId ? rows.find((row) => row.id === pageId) : undefined) ??
    (blockId ? rows.find((row) => row.id === blockId) : undefined);
  if (!page) return <BlockIdBadge id={id} />;

  const title = pageData(page).title || "Untitled";
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPane(pageDetailPane, { pageId: page.id }, { mode: "push" });
  };

  return (
    <LinkChip leading={<MdDescription />} title={title} onClick={open}>
      {title}
    </LinkChip>
  );
}
