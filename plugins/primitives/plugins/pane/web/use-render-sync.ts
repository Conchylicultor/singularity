import { useRef } from "react";

/**
 * Run `fn` synchronously DURING render, but only when `deps` change — the
 * deps-gated render-phase side-effect idiom.
 *
 * Unlike `useEffect` (which runs post-commit, one render too late), the work
 * lands *before* later hooks/reads in the SAME render. The pane router depends
 * on this ordering: `setBasePath` → `useSyncPaneRegistry` (rebuild the registry
 * + `handleLocationChange`) → `useRoute()` must all resolve against fresh state
 * on a single pass, or the first paint resolves the route against a stale/empty
 * registry (blank frame, "Unknown pane"). A `useEffect` would defer the write
 * past that same-render consumption and break initial route resolution.
 *
 * This replaces the `useMemo(() => { sideEffect(); }, deps)` anti-idiom — which
 * trips `react-hooks/void-use-memo` (useMemo must compute and return a value) —
 * with a single named primitive. The deps are compared by shallow identity, so
 * gating is byte-identical to the `useMemo` it replaces. The only Rules-of-React
 * exemption (the prev-deps ref guard, read+written during render) is localized
 * here rather than scattered across every caller.
 */
/* eslint-disable react-hooks/refs -- deps-gated render-phase sync: the prev-deps ref guard is read+written during render by design; fn must run in render, not in a post-commit effect. */
export function useRenderSync(fn: () => void, deps: readonly unknown[]): void {
  const prev = useRef<readonly unknown[] | null>(null);
  const last = prev.current;
  const changed =
    last === null ||
    last.length !== deps.length ||
    deps.some((dep, i) => !Object.is(dep, last[i]));
  if (changed) {
    prev.current = deps;
    fn();
  }
}
/* eslint-enable react-hooks/refs */
