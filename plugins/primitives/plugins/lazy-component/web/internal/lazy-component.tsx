import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Loading } from "@plugins/primitives/plugins/loading/web";

export interface LazyComponentOptions {
  /**
   * Node shown while the lazy chunk downloads/evaluates. Defaults to a delayed
   * `<Loading variant="spinner" />` — the Loading primitive fades in only after
   * ~120ms, so a fast chunk load never flashes a fallback. Pass a full-surface
   * fallback (e.g. a centered spinner) for a whole-pane component, or `null` for
   * an inline widget that should simply pop in.
   */
  fallback?: ReactNode;
}

/**
 * Pairs `React.lazy` with its own `Suspense` boundary so a heavy component can be
 * code-split out of the eager plugin-boot wave (see
 * `web-core/CLAUDE.md` "Bundle analysis") without relying on an ambient Suspense
 * in the render path — there is none: slot-render, panes (`PaneResolveGuard`), and
 * app surfaces (`TabSurface`) all render `<Component/>` directly. The returned
 * component is a drop-in for the original: every call site keeps `<Foo {...props}/>`.
 *
 * `React.lazy` caches the resolved module, so only the FIRST mount in a session
 * suspends; later mounts render synchronously.
 *
 * Named exports use the standard idiom:
 *
 * ```ts
 * const GraphCanvas = lazyComponent(() =>
 *   import("./graph-canvas-impl").then((m) => ({ default: m.GraphCanvas })),
 * );
 * ```
 *
 * Note: the boundary does not forward `ref`. A component consumed with a `ref`
 * must expose its imperative handle another way (or wrap the impl in
 * `forwardRef` before lazy-loading).
 */
export function lazyComponent<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  opts?: LazyComponentOptions,
): ComponentType<P> {
  const Lazy = lazy(loader);
  const fallback = opts?.fallback ?? <Loading variant="spinner" />;
  return function LazyBoundary(props: P) {
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
