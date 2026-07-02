import { useSyncExternalStore } from "react";

// Deferred-load signal — a tiny module-level external store that broadcasts how
// far the post-paint deferred plugin tier has progressed.
//
// WHY it exists: with deferred loading (see load-tiers.ts), a cold deep-link into
// an app paints the chrome + app shell immediately but the route's *content*
// pane may belong to a plugin that hasn't loaded yet — so the pane router finds
// no match for a beat. The layout host consumes this signal to render a loading
// placeholder for an unmatched route **while deferred loading is still in
// progress**, only falling through to not-found once loading has settled. It is
// the boot loader's one-way progress beacon; the UX that reads it lives in the
// layout host plugin.
//
// App.tsx (the boot sequencer) is the sole writer: it calls
// `markDeferredPluginsLoaded` after each batch appends and `markDeferredLoadComplete`
// once every deferred entry has loaded (or failed — a failed load still counts
// as settled so the placeholder can resolve to not-found instead of spinning
// forever).

export interface DeferredLoadState {
  /** Dotted plugin ids (`LoadedPlugin.id`) loaded in the deferred tier so far. */
  loadedPluginIds: ReadonlySet<string>;
  /** True once the deferred tier has fully settled (all loaded or failed). */
  deferredComplete: boolean;
}

let loadedPluginIds: Set<string> = new Set();
let deferredComplete = false;

// A fresh snapshot object is minted on every change so `useSyncExternalStore`'s
// referential comparison detects it; between changes the SAME reference is
// returned (required — a new object each getSnapshot would loop forever).
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: the plugin registry loads ONCE per page at the App root (the single writer), so which deferred plugins have loaded is a page-wide fact shared identically by every keep-alive/desktop surface mount — a per-surface scoped store would be semantically wrong (each surface would track its own load state for the one shared registry).
let snapshot: DeferredLoadState = { loadedPluginIds, deferredComplete };

const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { loadedPluginIds, deferredComplete };
  for (const l of listeners) l();
}

/** Record a freshly-loaded deferred batch's plugin ids. No-op for an empty batch. */
export function markDeferredPluginsLoaded(ids: string[]): void {
  if (ids.length === 0) return;
  // Copy-on-write so the exposed set is never mutated after being handed out.
  loadedPluginIds = new Set(loadedPluginIds);
  for (const id of ids) loadedPluginIds.add(id);
  emit();
}

/** Mark the deferred tier fully settled. Idempotent. */
export function markDeferredLoadComplete(): void {
  if (deferredComplete) return;
  deferredComplete = true;
  emit();
}

/** Imperative (non-hook) read of the current deferred-load state. */
export function getDeferredLoadState(): DeferredLoadState {
  return snapshot;
}

/** Subscribe to deferred-load state changes; returns an unsubscribe fn. */
export function subscribeDeferredLoadState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive read of the deferred-load state (re-renders on each batch / completion). */
export function useDeferredLoadState(): DeferredLoadState {
  return useSyncExternalStore(
    subscribeDeferredLoadState,
    getDeferredLoadState,
    getDeferredLoadState,
  );
}
