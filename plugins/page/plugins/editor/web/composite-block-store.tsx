// The composite block store: inline nested-page expansion as a THIRD
// `BlockStore` implementation. `CompositeServerProviderHost` mounts one
// `useServerBlockStore` feed per expanded page reachable from the base
// (`deriveMounts`), composes their rows into one union document, and routes
// every write back to the page that owns its rows — so `BlockEditorProviderInner`
// (and the whole render/reducer/undo/CRDT stack) sees a single flat document
// with the page boundary as data, not component structure. See
// `research/2026-07-23-page-inline-nested-page-expansion.md`.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { enqueueResourceWrite } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { blocksResource, moveBlock, patchBlocks, type Block } from "../core";
import { BlockEditorProviderInner } from "./block-editor-context";
import type { CaretSurfaceRef } from "./caret-surface";
import { useServerBlockStore, type BlockStore } from "./block-store";
import type { BlockOverlayOp } from "./internal/optimistic-block-ops";
import {
  deriveMounts,
  groupPatchByOwnerPage,
  insertOwnerPage,
  pageByAnchor,
  remapUnionParents,
  rowOwnerPage,
  splitOpByOwnerPage,
  translateOpForStore,
  translatePatchForStore,
  translateUnionParentId,
} from "./internal/composition";

/**
 * One mounted feed's published state. `data`/`serverData`/`pending` are the
 * render-driving snapshot (reference-stable through `useOptimisticResource`'s
 * memoization); `store` is a stable-identity ref to the feed's CURRENT
 * `BlockStore`, so routed writes always reach the latest render's callbacks
 * without the registry churning on every store re-creation.
 */
interface FeedSnapshot {
  data: Block[];
  serverData: Block[];
  pending: boolean;
  store: { readonly current: BlockStore };
}

/**
 * The sanctioned dynamic-hook-count seam: the composite renders one
 * `PageFeedMount` per mounted page, and each mount calls exactly one
 * `useServerBlockStore`. The snapshot publishes via an effect keyed on the
 * reference-stable triplet; the host's `setFeeds` bails on reference-equal
 * snapshots, so a no-op push can never loop publish→render→publish.
 */
function PageFeedMount({
  pageId,
  onSnapshot,
  onRelease,
}: {
  pageId: string;
  onSnapshot: (pageId: string, snapshot: FeedSnapshot) => void;
  onRelease: (pageId: string) => void;
}) {
  const store = useServerBlockStore(pageId);
  const storeRef = useLatestRef(store);
  const { data, serverData, pending } = store;
  useEffect(() => {
    onSnapshot(pageId, { data, serverData, pending, store: storeRef });
  }, [pageId, data, serverData, pending, onSnapshot]);
  useEffect(() => () => onRelease(pageId), [pageId, onRelease]);
  return null;
}

/**
 * The server-backed provider host: the composite union over every mounted
 * page's feed, handed to the storage-agnostic `BlockEditorProviderInner` as one
 * `BlockStore`. With no expanded nested page it degenerates to exactly one feed
 * (the base page) and identity composition.
 */
export function CompositeServerProviderHost({
  pageId: basePageId,
  enabledBlockTypes,
  onOpenPage,
  caretBefore,
  caretAfter,
  children,
}: {
  pageId: string;
  enabledBlockTypes?: readonly string[];
  onOpenPage?: (pageId: string) => void;
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
  children: ReactNode;
}) {
  const [feeds, setFeeds] = useState<ReadonlyMap<string, FeedSnapshot>>(
    () => new Map<string, FeedSnapshot>(),
  );

  const publishFeed = useCallback((pageId: string, snapshot: FeedSnapshot) => {
    setFeeds((prev) => {
      const cur = prev.get(pageId);
      // Convergence guard: a publish carrying reference-identical state must
      // return the SAME map, or each push would mint a new union and re-run the
      // publish effect forever.
      if (
        cur &&
        cur.data === snapshot.data &&
        cur.serverData === snapshot.serverData &&
        cur.pending === snapshot.pending
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(pageId, snapshot);
      return next;
    });
  }, []);

  const releaseFeed = useCallback((pageId: string) => {
    setFeeds((prev) => {
      if (!prev.has(pageId)) return prev;
      const next = new Map(prev);
      next.delete(pageId);
      return next;
    });
  }, []);

  const mounts = useMemo(() => {
    const rowsByPage = new Map<string, readonly Block[]>();
    for (const [pageId, feed] of feeds) rowsByPage.set(pageId, feed.data);
    return deriveMounts(basePageId, rowsByPage);
  }, [basePageId, feeds]);

  // The union document, concatenated in mount (BFS) order and remapped into
  // union space (page-link content nests under its link row). Render order is
  // irrelevant here — the editor sorts by rank + buildTree — but a stable
  // concatenation keeps the array reference-cheap to diff.
  const data = useMemo(() => {
    const union: Block[] = [];
    for (const pageId of mounts.keys()) {
      const feed = feeds.get(pageId);
      if (feed) union.push(...feed.data);
    }
    return remapUnionParents(union, mounts);
  }, [feeds, mounts]);

  // Authoritative rows, un-remapped: consumers read only row ids off it (the
  // doc-init FK gate's `serverIds`, the projection's existence gate).
  const serverData = useMemo(() => {
    const union: Block[] = [];
    for (const pageId of mounts.keys()) {
      const feed = feeds.get(pageId);
      if (feed) union.push(...feed.serverData);
    }
    return union;
  }, [feeds, mounts]);

  // The BASE feed's pending only: a still-loading expanded child contributes no
  // rows yet but must not blank the whole editor.
  const pending = feeds.get(basePageId)?.pending ?? true;

  // Cumulative indexes for writes that outlive their feed (undo entries are
  // mount-scoped to the EDITOR, not to a child feed, so they can replay after
  // the child collapsed):
  //  - row id → owning page, for update/delete ids whose row left the union;
  //  - every translated (page-link) anchor ever mounted, mapped to its page, so
  //    recorded union-space parents still translate after the link collapsed.
  // Append-only and bounded by the rows seen during this editor's mount —
  // exactly the ids a mount-scoped undo thunk can still name.
  const seenOwnersRef = useRef(new Map<string, string>());
  const seenAnchorsRef = useRef(new Map<string, string>());
  useEffect(() => {
    for (const [pageId, feed] of feeds) {
      for (const row of feed.data) seenOwnersRef.current.set(row.id, pageId);
    }
    for (const [anchorId, pageId] of pageByAnchor(mounts)) {
      seenAnchorsRef.current.set(anchorId, pageId);
    }
  }, [feeds, mounts]);

  const feedsRef = useLatestRef(feeds);
  const mountsRef = useLatestRef(mounts);
  const dataRef = useLatestRef(data);

  // The owning page's live store. Throws on an unmounted page: an OP targets
  // rows the user can currently see, so a miss is a routing bug — fail loudly.
  // (The two writes that legitimately have no mounted feed — the detached patch
  // persist and the cross-page move — never come through here.)
  const storeFor = useCallback((owner: string): BlockStore => {
    const feed = feedsRef.current.get(owner);
    if (!feed) throw new Error(`No mounted feed for page ${owner}`);
    return feed.store.current;
  }, []);

  /**
   * A drop whose source and destination live on DIFFERENT pages permutes two
   * forests at once, and no per-page overlay can predict it: the moved row leaves
   * the source page's `blocksResource` entirely (the server re-stamps its
   * `page_id`), so the source feed could never confirm a `reparent` effect that
   * names a row it will never hold again.
   *
   * So a cross-page move stays on the id-scoped `moveBlock` endpoint, which is
   * already cross-page-aware (it locks BOTH forests, recomputes `page_id`, and
   * notifies both scopes). What Stage 4 gives it is ORDER: the write is enqueued
   * on the SOURCE page's send lane, so it still departs after every structural
   * write the user issued before it. There is nothing to predict; there is
   * something to order.
   */
  const moveAcrossPages = useCallback(
    (sourcePageId: string, op: Extract<BlockOverlayOp, { tag: "op" }>["op"]) => {
      if (op.kind !== "move") throw new Error(`Not a move op: ${op.kind}`);
      const parentId = translateUnionParentId(op.parentId, mountsRef.current);
      void enqueueResourceWrite(blocksResource, { pageId: sourcePageId }, () =>
        fetchEndpoint(
          moveBlock,
          { id: op.blockId },
          { body: { parentId, targetId: op.targetId, zone: op.zone } },
        ),
      );
    },
    [],
  );

  const dispatch = useCallback(
    (v: BlockOverlayOp) => {
      const curMounts = mountsRef.current;
      if (v.tag === "patch") {
        // A patch may legitimately span pages (undoing a cross-page bulk
        // delete), so split it per owner. Update + delete ids carry no page of
        // their own, so they resolve through the union first, then the
        // cumulative index (rows that left with a collapse).
        const rows = dataRef.current;
        const ownerOf = (id: string) =>
          rows.find((b) => b.id === id)?.pageId ?? seenOwnersRef.current.get(id) ?? null;
        for (const [owner, group] of groupPatchByOwnerPage(v.patch, ownerOf)) {
          const patch = translatePatchForStore(group, seenAnchorsRef.current);
          const feed = feedsRef.current.get(owner);
          if (feed) {
            feed.store.current.dispatch({ tag: "patch", patch });
          } else {
            // Detached persist (undo/redo targeting a collapsed page): no
            // mounted feed means no overlay to reconcile, so write the patch
            // straight to the owning page — the data stays correct, invisible
            // until re-expanded. The send lane is MODULE-level, so the write
            // still joins that page's own ordered stream with no mounted hook:
            // ordering holds, there is simply nothing to predict.
            void enqueueResourceWrite(blocksResource, { pageId: owner }, () =>
              fetchEndpoint(patchBlocks, { pageId: owner }, { body: patch }),
            );
          }
        }
        return;
      }
      // A cross-page single-block drop is the ONE structural write no page's
      // overlay can carry — see `moveAcrossPages`.
      if (v.op.kind === "move") {
        const rows = dataRef.current;
        const sourcePageId = rowOwnerPage(rows, v.op.blockId);
        const destPageId = insertOwnerPage(rows, v.op.parentId, curMounts, basePageId);
        if (sourcePageId !== destPageId) {
          moveAcrossPages(sourcePageId, v.op);
          return;
        }
      }
      // Every other op routes to the page owning its rows; only a `delete` set
      // may span pages, and it fans out into one op per page.
      for (const { owner, v: routed } of splitOpByOwnerPage(
        dataRef.current,
        v,
        curMounts,
        basePageId,
      )) {
        storeFor(owner).dispatch(
          translateOpForStore(routed, curMounts, seenAnchorsRef.current),
        );
      }
    },
    [basePageId, storeFor, moveAcrossPages],
  );

  // There are no routed write members left. Every structural mutation is a
  // `BlockOp` (or an undo/redo `BlockPatch`), so it arrives through `dispatch`,
  // where `resolveOpOwnerPage` applies the anchor rules the bespoke members used
  // to (row owner for a named block, `insertOwnerPage` when anchorless,
  // `singleOwnerPage` for the sets that must not span pages) and
  // `translateOpForStore` rewrites a page-link anchor `parentId` into the real
  // page id.
  const store = useMemo<BlockStore>(
    () => ({ data, serverData, pending, dispatch }),
    [data, serverData, pending, dispatch],
  );

  return (
    <>
      {[...mounts.keys()].map((pageId) => (
        <PageFeedMount
          key={pageId}
          pageId={pageId}
          onSnapshot={publishFeed}
          onRelease={releaseFeed}
        />
      ))}
      <BlockEditorProviderInner
        store={store}
        pageId={basePageId}
        serverSync
        enabledBlockTypes={enabledBlockTypes}
        onOpenPage={onOpenPage}
        caretBefore={caretBefore}
        caretAfter={caretAfter}
      >
        {children}
      </BlockEditorProviderInner>
    </>
  );
}
