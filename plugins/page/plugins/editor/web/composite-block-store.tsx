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
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { patchBlocks, type Block, type SerializedBlock } from "../core";
import { BlockEditorProviderInner } from "./block-editor-context";
import type { CaretSurfaceRef } from "./caret-surface";
import {
  useServerBlockStore,
  type BlockMoveDest,
  type BlockStore,
} from "./block-store";
import type { BlockOverlayOp } from "./internal/optimistic-block-ops";
import {
  deriveMounts,
  groupIdsByOwnerPage,
  groupPatchByOwnerPage,
  insertOwnerPage,
  remapUnionParents,
  resolveOpOwnerPage,
  rowOwnerPage,
  singleOwnerPage,
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
  //  - row id → owning page, for delete ids whose row left the union;
  //  - every translated (page-link) anchor ever mounted, so recorded
  //    union-space parents still translate after the link collapsed.
  // Append-only and bounded by the rows seen during this editor's mount —
  // exactly the ids a mount-scoped undo thunk can still name.
  const seenOwnersRef = useRef(new Map<string, string>());
  const seenAnchorsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const [pageId, feed] of feeds) {
      for (const row of feed.data) seenOwnersRef.current.set(row.id, pageId);
    }
    for (const [pageId, anchorId] of mounts) {
      if (anchorId !== pageId) seenAnchorsRef.current.add(anchorId);
    }
  }, [feeds, mounts]);

  const feedsRef = useLatestRef(feeds);
  const mountsRef = useLatestRef(mounts);
  const dataRef = useLatestRef(data);

  // The owning page's live store. Throws on an unmounted page: every routed
  // write except a patch (which has the detached-persist path) targets rows
  // the user can currently see, so a miss is a routing bug — fail loudly.
  const storeFor = useCallback((owner: string): BlockStore => {
    const feed = feedsRef.current.get(owner);
    if (!feed) throw new Error(`No mounted feed for page ${owner}`);
    return feed.store.current;
  }, []);

  const dispatch = useCallback(
    (v: BlockOverlayOp) => {
      const curMounts = mountsRef.current;
      if (v.tag === "patch") {
        // A patch may legitimately span pages (undoing a cross-page bulk
        // delete), so split it per owner. Delete ids resolve through the union
        // first, then the cumulative index (rows that left with a collapse).
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
            // mounted feed means no overlay to reconcile, so POST the patch
            // straight to the owning page — the data stays correct, invisible
            // until re-expanded.
            // eslint-disable-next-line endpoints/no-void-fetch-endpoint -- detached persist into an unmounted page: there is no visible surface to reconcile, the page's own feed re-syncs on next expand, and a rejection still surfaces loudly as an unhandled-rejection crash report.
            void fetchEndpoint(patchBlocks, { pageId: owner }, { body: patch });
          }
        }
        return;
      }
      const owner = resolveOpOwnerPage(dataRef.current, v.op, curMounts, basePageId);
      storeFor(owner).dispatch(translateOpForStore(v, curMounts, seenAnchorsRef.current));
    },
    [basePageId, storeFor],
  );

  const move = useCallback(
    (id: string, dest: BlockMoveDest) => {
      // Route the optimistic overlay to the SOURCE row's feed; the endpoint is
      // id-scoped and already cross-page (the server recomputes `page_id` and
      // notifies both pages — the push reconciles the destination feed).
      const owner = rowOwnerPage(dataRef.current, id);
      const parentId = translateUnionParentId(dest.parentId, mountsRef.current);
      storeFor(owner).move(id, parentId === dest.parentId ? dest : { ...dest, parentId });
    },
    [storeFor],
  );

  const bulkDelete = useCallback(
    (ids: string[]) => {
      // Per-page groups match bulk-delete's `WHERE page_id` ownership guard;
      // each owning store deletes its own rows, so the op never half-applies.
      for (const [owner, group] of groupIdsByOwnerPage(dataRef.current, ids)) {
        storeFor(owner).bulkDelete(group);
      }
    },
    [storeFor],
  );

  const bulkMove = useCallback(
    (args: { ids: string[]; parentId: string | null; afterId: string | null }) => {
      const rows = dataRef.current;
      const curMounts = mountsRef.current;
      const anchorOwner =
        args.afterId !== null
          ? rowOwnerPage(rows, args.afterId)
          : insertOwnerPage(rows, args.parentId, curMounts, basePageId);
      // v1 guard: a multi-select drag whose roots span pages (or leave their
      // page) fails loudly rather than half-applying — see the plan's risk #2.
      const owner = singleOwnerPage(rows, args.ids);
      if (owner !== anchorOwner) {
        throw new Error(
          `Cannot bulk-move blocks of page ${owner} into page ${anchorOwner}; ` +
            `cross-page bulk moves are not supported`,
        );
      }
      storeFor(anchorOwner).bulkMove({
        ...args,
        parentId: translateUnionParentId(args.parentId, curMounts),
      });
    },
    [basePageId, storeFor],
  );

  const bulkDuplicate = useCallback(
    (ids: string[]): Promise<string[]> => {
      return storeFor(singleOwnerPage(dataRef.current, ids)).bulkDuplicate(ids);
    },
    [storeFor],
  );

  const paste = useCallback(
    (args: {
      blocks: SerializedBlock[];
      afterId: string | null;
      parentId?: string | null;
    }): Promise<string[]> => {
      const rows = dataRef.current;
      const curMounts = mountsRef.current;
      const owner =
        args.afterId !== null
          ? rowOwnerPage(rows, args.afterId)
          : insertOwnerPage(rows, args.parentId ?? null, curMounts, basePageId);
      return storeFor(owner).paste({
        ...args,
        parentId: translateUnionParentId(args.parentId ?? null, curMounts),
      });
    },
    [basePageId, storeFor],
  );

  const store = useMemo<BlockStore>(
    () => ({
      data,
      serverData,
      pending,
      dispatch,
      move,
      bulkDelete,
      bulkMove,
      bulkDuplicate,
      paste,
    }),
    [data, serverData, pending, dispatch, move, bulkDelete, bulkMove, bulkDuplicate, paste],
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
