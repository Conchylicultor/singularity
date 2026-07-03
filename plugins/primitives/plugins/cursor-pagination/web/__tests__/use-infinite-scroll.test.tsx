import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { useInfiniteScroll, type InfiniteScrollOptions } from "../internal/use-infinite-scroll";

/**
 * A controllable IntersectionObserver stub: the test drives when the sentinel
 * "intersects" via `fireIntersecting()`, and can read the `rootMargin` option.
 * Each `new IntersectionObserver(...)` registers itself; the hook disconnects +
 * recreates on every effect re-run, so `live()` is the current effect's observer.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  cb: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  disconnected = false;
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.cb = cb;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  static live(): FakeIntersectionObserver | undefined {
    return FakeIntersectionObserver.instances.filter((o) => !o.disconnected).at(-1);
  }
}

function fireIntersecting(): void {
  const obs = FakeIntersectionObserver.live();
  if (!obs) throw new Error("no live observer");
  act(() => {
    obs.cb(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      obs as unknown as IntersectionObserver,
    );
  });
}

/** A minimal host that mounts the hook and renders its real sentinel div. */
function Harness(props: InfiniteScrollOptions) {
  const { sentinelRef } = useInfiniteScroll(props);
  return <div ref={sentinelRef} data-testid="sentinel" />;
}

const baseOpts = (over: Partial<InfiniteScrollOptions>): InfiniteScrollOptions => ({
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: vi.fn(),
  ...over,
});

describe("useInfiniteScroll", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  it("fetches the next page when the sentinel intersects and a page remains", () => {
    const fetchNextPage = vi.fn();
    render(<Harness {...baseOpts({ fetchNextPage })} />);
    fireIntersecting();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does NOT fetch while a next-page fetch is in flight", () => {
    const fetchNextPage = vi.fn();
    render(<Harness {...baseOpts({ fetchNextPage, isFetchingNextPage: true })} />);
    fireIntersecting();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does NOT fetch when there is no next page", () => {
    const fetchNextPage = vi.fn();
    render(<Harness {...baseOpts({ fetchNextPage, hasNextPage: false })} />);
    fireIntersecting();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  // The regression this whole change exists for: after a failed next-page fetch,
  // `isFetchingNextPage` returns to false while `hasNextPage` stays true and the
  // sentinel stays intersecting. Without the `!isFetchNextPageError` gate the
  // recreated observer would immediately refetch — a hot loop. It must NOT.
  it("does NOT refetch while parked on a next-page error (no hot-loop)", () => {
    const fetchNextPage = vi.fn();
    const { rerender } = render(
      <Harness {...baseOpts({ fetchNextPage, isFetchingNextPage: true })} />,
    );
    // Fetch fails: fetching flips back to false AND the error flag is set. This
    // re-runs the effect (recreating the observer) — the exact loop trigger.
    rerender(<Harness {...baseOpts({ fetchNextPage, isFetchNextPageError: true })} />);
    fireIntersecting();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("re-arms and fetches again once the error clears (retry path)", () => {
    const fetchNextPage = vi.fn();
    const { rerender } = render(
      <Harness {...baseOpts({ fetchNextPage, isFetchNextPageError: true })} />,
    );
    fireIntersecting();
    expect(fetchNextPage).not.toHaveBeenCalled();
    // Error clears (e.g. the user hit Retry) → the observer re-arms.
    rerender(<Harness {...baseOpts({ fetchNextPage, isFetchNextPageError: false })} />);
    fireIntersecting();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("passes rootMargin through to the observer for early prefetch", () => {
    render(<Harness {...baseOpts({ rootMargin: "400px" })} />);
    expect(FakeIntersectionObserver.live()?.options?.rootMargin).toBe("400px");
  });
});
