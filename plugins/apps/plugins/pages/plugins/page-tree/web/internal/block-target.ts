import { useCallback, useState } from "react";
import { useLiveRow } from "@plugins/network/plugins/live/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  getBlockPage,
  pageData,
  pagesTree,
} from "@plugins/page/plugins/editor/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { blockDetailPane, pageDetailPane } from "../panes";

/**
 * What a bare block id opens, answered once for every surface that holds one (a
 * transcript chip, an Artifacts row, the block pane itself).
 *
 * - `page` — the id is a page: open the page.
 * - `block` — a content block inside `pageId`: open the block view.
 * - `missing` — no live block has this id (never existed, trashed, or a stale
 *   worktree fork that lacks it). An ordinary outcome, not a failure.
 * - `error` — the lookup itself failed; distinct from `missing` so a surface
 *   never renders "no such block" for a request that never answered.
 */
export type BlockTarget =
  | { kind: "pending" }
  | { kind: "missing" }
  | { kind: "error"; error: Error }
  | { kind: "page"; pageId: string }
  | { kind: "block"; pageId: string; blockId: string; type: string };

const PENDING: BlockTarget = { kind: "pending" };
const MISSING: BlockTarget = { kind: "missing" };

/**
 * Resolve a block id in two tiers, which are not interchangeable:
 *
 * - `pagesTree` — every `type="page"` row, read by id (`:rows`). A PAGE id
 *   (what a URL and the sidebar expose) is answered from it, with no endpoint
 *   request.
 * - `getBlockPage` — the reverse lookup for a CONTENT block, which the pages
 *   set structurally cannot answer. Fired only on a known miss, so a transcript
 *   full of page ids costs no lookup.
 *
 * Once the lookup has said the id is a CONTENT block, the `:rows` read is
 * dropped (`null`). A point tuple refills every id it holds on any write to
 * that row, member or not — so holding a content block's id would cost a
 * `pages.tree:rows` load per typing projection of that block, for as long as
 * the block pane (or a chip naming it) is open. Dropping it costs nothing: a
 * content block becomes a page only through turn-into-page, and the lookup
 * already answered for this id.
 */
export function useBlockTarget(blockId: string): BlockTarget {
  // The id the lookup has answered as a content block — its `:rows` read is
  // dropped from then on (see above). Keyed by id, so a new id reads again.
  const [contentId, setContentId] = useState<string | null>(null);
  const page = useLiveRow(pagesTree, contentId === blockId ? null : blockId);
  // `null` until the row read answers (the target then answers from its own
  // state below); the reverse lookup fires only on a known miss.
  const isListedPage =
    page.status === "loading" || page.status === "error" ? null : page.found;
  const lookup = useEndpoint(
    getBlockPage,
    { id: blockId },
    {
      enabled: isListedPage === false,
      // Ids are immutable and a block's page changes only on a cross-page move,
      // so one lookup per id per session is plenty.
      staleTime: 5 * 60_000,
    },
  );

  if (page.status === "loading") return PENDING;
  if (page.status === "error") return { kind: "error", error: page.error };
  if (isListedPage) return { kind: "page", pageId: blockId };
  if (lookup.isError) return { kind: "error", error: lookup.error };
  if (lookup.isPending) return PENDING;
  const found = lookup.data;
  if (!found.found) return MISSING;
  if (found.isPage) return { kind: "page", pageId: found.pageId };
  // React's render-time state adjustment: the next render drops the `:rows`
  // read, and answers from the lookup alone (`null` reads `found: false`).
  if (contentId !== blockId) setContentId(blockId);
  return { kind: "block", pageId: found.pageId, blockId, type: found.type };
}

/**
 * Opens a resolved target in the pane that shows it, as a column to the RIGHT
 * of the current surface (`push`) — so the transcript, or the page, the id was
 * found in stays beside it.
 */
export function useOpenBlockTarget(): (
  target: Extract<BlockTarget, { kind: "page" | "block" }>,
) => void {
  const openPane = useOpenPane();
  return useCallback(
    (target) => {
      if (target.kind === "page") {
        openPane(pageDetailPane, { pageId: target.pageId }, { mode: "push" });
      } else {
        openPane(
          blockDetailPane,
          { blockId: target.blockId },
          { mode: "push" },
        );
      }
    },
    [openPane],
  );
}

/**
 * The human name of a block TYPE — its handle's `label` from the `Editor.Block`
 * registry ("TODO", "Toggle", "Heading 1"), derived from the registrations so a
 * new block plugin names itself here with no edit. A type with no label (or no
 * plugin loaded for it) reads as its raw type string rather than as nothing.
 */
export function useBlockTypeLabel(type: string): string {
  const contributions = Editor.Block.useContributions();
  return contributions.find((c) => c.block.type === type)?.block.label ?? type;
}

/** A page with no title of its own still has to be called something. */
const UNTITLED = "Untitled";

/**
 * A resolved target's one-line name: the page's title, or for a block
 * "<page title> › <block type label>" ("Plugin system › TODO") — the block is
 * named by where it lives and what it is, since a void card has no words of its
 * own. `undefined` while the target or the pages list is not known yet, or when
 * the target opens nothing (`missing` / `error`) — never a stand-in title.
 */
export function useBlockTargetTitle(target: BlockTarget): string | undefined {
  const label = useBlockTypeLabel(target.kind === "block" ? target.type : "");
  const opens = target.kind === "page" || target.kind === "block";
  const page = useLiveRow(pagesTree, opens ? target.pageId : null);
  if (!opens) return undefined;
  // The page row not known (loading), failed or absent: no title, never a
  // stand-in.
  if (page.status === "loading" || page.status === "error") return undefined;
  if (!page.found) return undefined;
  const title = pageData(page.row).title || UNTITLED;
  return target.kind === "page" ? title : `${title} › ${label}`;
}
