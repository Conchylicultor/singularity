# Infinite-scroll sentinel: error-gate the auto-fetch (kill the hot-loop class)

## Problem

`useCursorPagination` (`plugins/primitives/plugins/cursor-pagination/web/internal/use-cursor-pagination.ts`)
attaches an `IntersectionObserver` to a sentinel and fires `fetchNextPage()`
whenever `isIntersecting && hasNextPage && !isFetchingNextPage`. When a
next-page fetch **fails**, `isFetchingNextPage` returns to `false` while
`hasNextPage` stays `true` and the sentinel stays in view. The
`isFetchingNextPage` false→true→false transition re-runs the effect, which
disconnects and recreates the observer; a fresh observer immediately re-fires
its callback against the still-intersecting sentinel → refetch → … a tight
retry loop (network spam, no recovery UI).

This is **not one bug** — it is a **class**. Grepping `new IntersectionObserver`
finds **four** independent hand-rolled copies of the same auto-fetch pattern:

| Site | Error-gated? |
|---|---|
| `primitives/cursor-pagination` `useCursorPagination` | ❌ (loops) — used by conversations history/grouped |
| `primitives/data-view` `useServerDataSource` | ❌ (loops) |
| `apps/mail/thread-list` `thread-list.tsx` | ❌ (loops) |
| `apps/mail/search` `useMailSearch` | ✅ but **hand-rolled** gate + bespoke Retry markup |

Only mail-search remembered to guard, by additionally gating its observer on
`!isFetchNextPageError` and hand-rolling an inline Retry. Every other consumer
silently hot-loops on a failed page fetch, and mail-search's guard is a
copy-paste waiting to rot.

## Fix: one primitive owns the observer, gated by construction

Extract the observer + error gate + retry affordance into a single primitive in
`cursor-pagination` (the plugin that already owns `ScrollSentinel` and is already
imported by every consumer here). Then **all four** consume it, so the footgun
cannot be re-authored.

### New: `useInfiniteScroll` hook (`cursor-pagination/web/internal/use-infinite-scroll.ts`)

```ts
export interface InfiniteScrollOptions {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
}
export interface InfiniteScrollHandle {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  retry: () => void;
}
export function useInfiniteScroll(opts: InfiniteScrollOptions): InfiniteScrollHandle;
```

- Owns the single `IntersectionObserver` on `sentinelRef`.
- Gate: `isIntersecting && hasNextPage && !isFetchingNextPage && !isFetchNextPageError`.
- `isFetchNextPageError` is in the effect deps, so clearing the error (via
  `retry`, which re-enters `isFetchingNextPage`) re-arms the observer.
- `retry = fetchNextPage`.

### New: `<InfiniteScrollFooter>` component (`cursor-pagination/web/internal/infinite-scroll-footer.tsx`)

The single reusable "loading more / couldn't load / sentinel" footer, so the
retry UX is authored **once** (today mail hand-rolls it, the other three have
none):

```tsx
export interface InfiniteScrollFooterProps {
  handle: InfiniteScrollHandle;
  loadingLabel?: string; // default "Loading…"
  errorLabel?: string;   // default "Couldn't load more."
}
```

Renders, in order: a `<Loading variant="spinner">` while fetching; a centered
error placeholder + ghost `Retry` button while errored; and
`<ScrollSentinel show={hasNextPage && !isFetchNextPageError} />`. Composes the
existing css primitives exactly as mail's current inline retry does.

Both are re-exported from `cursor-pagination/web/index.ts`.

## Consumer conversions (eliminate all four hand-rolled observers)

1. **`useCursorPagination`** — destructure `isFetchNextPageError` from
   `useInfiniteQuery`, delete its observer effect, delegate to `useInfiniteScroll`.
   `CursorPaginationHandle = { items } & InfiniteScrollHandle` (its old
   `fetchNextPage` field, unused by any caller, becomes `retry`).
   - `conversations-view/history` + `grouped` views: replace the ad-hoc
     `{isFetchingNextPage && <Loading/>}` + `<ScrollSentinel show={hasNextPage}/>`
     with `<InfiniteScrollFooter handle={pagination} />`. **They gain a Retry
     they never had** (previously they hot-looped silently).

2. **`useServerDataSource`** (data-view) — destructure `isFetchNextPageError`,
   delete its observer effect, delegate to `useInfiniteScroll`. Result becomes
   `{ rows, loading, scroll: InfiniteScrollHandle }` (folding the old
   `hasMore`/`fetchMore`/`sentinelRef`). `data-view.tsx` renders
   `<InfiniteScrollFooter handle={server.scroll} />` in place of the bare
   sentinel — gaining a "loading more" spinner + Retry. Update the co-located
   `use-server-data-source.test.tsx` to the `scroll.*` shape.

3. **`useThreadList`** + `thread-list.tsx` (mail) — return `isFetchNextPageError`
   + a `scroll` handle from `useInfiniteScroll`; delete the component's
   hand-rolled observer; render `<InfiniteScrollFooter handle={scroll} />`.

4. **`useMailSearch`** + `mail-search-body.tsx` (mail) — delete its bespoke
   observer + inline Retry; delegate to `useInfiniteScroll`; return
   `scroll: InfiniteScrollHandle`; render `<InfiniteScrollFooter handle={scroll} />`.

After this, `new IntersectionObserver` for pagination appears in exactly **one**
place (the primitive), and the error gate is structural, not remembered.

## Non-goals / notes

- No server changes. Pure client primitive + call-site refactor.
- `ScrollSentinel` stays a dumb div; the footer composes it.
- The `data-view` dev-guards / sticky-toolbar behavior is untouched (the footer
  renders below the view body exactly where the bare sentinel was).
</content>
</invoke>
