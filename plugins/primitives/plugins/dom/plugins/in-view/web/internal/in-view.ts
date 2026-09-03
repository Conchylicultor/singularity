import { useEffect, type DependencyList } from "react";

import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";

type RefLike = { readonly current: Element | null };

/**
 * What to observe. A ref is read at effect time — a stable `RefObject`, so the
 * observer subscribes once. A getter is also called at effect time and may
 * return a lazily-resolved node. Re-subscription is driven by `deps`, not by the
 * target's identity, so an inline getter never re-subscribes every render.
 */
export type InViewTarget = RefLike | (() => Element | null | undefined);

/**
 * The box intersections are measured against. A ref (resolved at construction),
 * an Element, or nothing — which means the viewport.
 */
export type InViewRoot = RefLike | Element | null;

export type InViewOptions = {
  root?: InViewRoot;
  rootMargin?: string;
  threshold?: number | number[];
};

export interface InViewWatcher {
  /** Idempotent: a node already watched is skipped, so a re-enrollment pass costs nothing. */
  observe(el: Element): void;
  disconnect(): void;
}

function resolveRoot(root: InViewRoot | undefined): Element | null {
  if (!root) return null;
  return "current" in root ? root.current : root;
}

/**
 * The single sanctioned home for `new IntersectionObserver` — this function is
 * the repo's only construction of one, and the lint allowlist's one entry.
 *
 * Beyond owning the constructor it owns the **enrollment rule**: a `WeakSet` of
 * the nodes already watched, so a surface that re-enrolls its elements as they
 * mount (a streaming transcript, a virtualized list) pays only for the genuinely
 * new ones. `observe()` on an already-observed target is a spec no-op anyway —
 * the WeakSet is what keeps the pass itself from costing work, and it is a
 * `WeakSet` rather than a `Set` so a torn-out element stays collectable. Living
 * here means no consumer can omit it; every hand-rolled copy before this one had
 * to remember to.
 *
 * Pure DOM — no React. {@link useInView} is the hook around it.
 */
export function createInViewWatcher(
  onChange: (entries: IntersectionObserverEntry[]) => void,
  options?: InViewOptions,
): InViewWatcher {
  let enrolled = new WeakSet<Element>();
  const observer = new IntersectionObserver(onChange, {
    root: resolveRoot(options?.root),
    rootMargin: options?.rootMargin,
    threshold: options?.threshold,
  });

  return {
    observe(el) {
      if (enrolled.has(el)) return;
      enrolled.add(el);
      observer.observe(el);
    },
    disconnect() {
      observer.disconnect();
      // Release the element references with the observer that held them. A
      // watcher is not resurrected after this: re-observing would re-arm the
      // underlying observer, which is a leak, not a feature.
      enrolled = new WeakSet();
    },
  };
}

/**
 * Observe ONE element and run `onChange` on each delivery, with the **most
 * recent** entry of the batch (`entries.at(-1)`). For a single target that is
 * its current state; the first entry of a batch can be a superseded observation.
 *
 * `onChange` is stabilised internally ({@link useEventCallback}), so it always
 * sees the latest closure without re-subscribing the observer — which makes
 * `deps` load-bearing rather than ergonomic:
 *
 * **A rebuild is a feature.** Everything the caller wants the observer rebuilt
 * on — `rootMargin`, `root`, `threshold`, a resolved target node, a gate flag —
 * belongs in `deps`, because a fresh observer re-delivers against a
 * still-intersecting element. That re-delivery is exactly how infinite scroll
 * fires page N+1: the sentinel never moved, so only a new observer can ask about
 * it again. Stabilise the callback, forget `deps`, and pagination silently
 * stalls after page 1 — nothing throws, nothing logs.
 */
export function useInView(
  target: InViewTarget,
  onChange: (entry: IntersectionObserverEntry) => void,
  options?: InViewOptions & { deps?: DependencyList },
): void {
  const deps = options?.deps ?? [];
  const handler = useEventCallback(onChange);

  // Not `useLayoutEffect`: unlike an element measurement there is nothing to read
  // synchronously here — `IntersectionObserver` delivers asynchronously anyway.
  useEffect(() => {
    const el = typeof target === "function" ? target() : target.current;
    if (!el) return;

    const watcher = createInViewWatcher((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) handler(entry);
    }, options);
    watcher.observe(el);

    return () => watcher.disconnect();
    // `handler` is stable; `target` and `options` are read at effect time (a
    // stable ref, or a getter re-evaluated each run). Re-subscribe only on
    // `deps` — see the rebuild note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handler, ...deps]);
}
