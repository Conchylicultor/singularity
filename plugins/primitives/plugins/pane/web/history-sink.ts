import type { PaneOptions, PaneStore } from "./pane";

// ---------------------------------------------------------------------------
// HistoryAdapter — the seam that keeps the pane primitive app-agnostic.
//
// The pane store is the single source of truth for what is on screen; the
// browser URL + `history.state` are a pure PROJECTION of it. The store never
// touches `window.history` directly. Instead it emits push/replace *intents*
// through the installed `HistoryAdapter`:
//
//   • setRoute / navigatePending  →  historyAdapter.commit(change)
//   • real browser back/forward   →  historyAdapter.restore()
//
// Standalone (and in tests) the `defaultHistoryAdapter` writes the pane's route
// payload verbatim and restores it straight back into the live store — today's
// behavior, unchanged. The tabs layer installs an app-aware adapter (via
// `setHistoryAdapter`) that additionally stamps `{ tabId, appId }` into each
// entry so a history entry is a COMPLETE snapshot of what the user was looking
// at, and restores the whole snapshot (refocus the tab, re-sync its app,
// restore the route) with zero URL parsing. See the pane + tabs CLAUDE.md.
// ---------------------------------------------------------------------------

/**
 * The serialized shape of one pane slot as it lives in `history.state.route`.
 * Mirrors what `setRoute` writes and what `handleLocationChange` reads back — a
 * pane's ephemeral `hint` is deliberately absent (never serialized).
 */
export type SerializedSlot = {
  paneId: string;
  params: Record<string, string>;
  options: PaneOptions;
  uuid: string;
};

/**
 * The pane's own route payload for one history entry — a resolved route or a
 * pending (unresolved) URL. The shell adapter widens this with `{ tabId, appId }`
 * when it writes; `handleLocationChange` reads only these keys and ignores the
 * rest, so the two runtimes never need to agree on the composite shape.
 */
export type PaneHistoryState = { route: SerializedSlot[] } | { pending: string };

/** An in-memory route change to project onto the browser. */
export interface LocationChange {
  /** Full pathname, base path already applied. */
  url: string;
  /** The pane's route payload for this entry. */
  state: PaneHistoryState;
  mode: "push" | "replace";
}

export interface HistoryAdapter {
  /** Project an in-memory route change onto the browser (URL + history entry). */
  commit(change: LocationChange): void;
  /** Real browser back/forward fired — rebuild the in-memory state from history. */
  restore(): void;
}

// The default adapter's `restore()` must reach the live PaneStore, which lives
// in pane.ts. pane.ts already imports THIS module (for the pointer + commit), so
// having history-sink import pane.ts back would form a runtime import cycle.
// Instead pane.ts injects a thunk at module-load time — the runtime dependency
// stays one-way (pane.ts → history-sink), and the only edge back is this
// type-only import (erased at runtime).
let getLiveStore: (() => PaneStore) | null = null;

/** Wire the live-store accessor. Called once by pane.ts at module load. */
export function setLiveStoreAccessor(fn: () => PaneStore): void {
  getLiveStore = fn;
}

/**
 * The standalone adapter — the behavior when no shell adapter is installed
 * (tests, and any composition without the tabs layer). `commit` writes the
 * route payload verbatim and announces it via `shell:navigate`; `restore`
 * rebuilds straight off the live store's `handleLocationChange` (which reads
 * `history.state`). It ignores any extra `{ tabId, appId }` keys a prior shell
 * adapter may have left, so swapping adapters mid-session never corrupts a read.
 */
export const defaultHistoryAdapter: HistoryAdapter = {
  commit({ url, state, mode }) {
    const method = mode === "replace" ? "replaceState" : "pushState";
    window.history[method](state, "", url);
    // Announce programmatic navigation as `shell:navigate` ONLY — never a
    // synthetic `popstate`. The single module-level `popstate` listener is
    // reserved for REAL browser back/forward → restore(); reactivity consumers
    // (usePathname, useActiveApp, pane-restore) all also listen to
    // `shell:navigate`, so they still update.
    window.dispatchEvent(new CustomEvent("shell:navigate"));
  },
  restore() {
    if (!getLiveStore) {
      throw new Error(
        "defaultHistoryAdapter.restore() ran before the live-store accessor was injected — pane.ts must call setLiveStoreAccessor() at module load.",
      );
    }
    getLiveStore().handleLocationChange();
  },
};

// The currently-installed adapter. `defaultHistoryAdapter` until the tabs layer
// installs its own; a getter (not an exported mutable binding) so the single
// pane.ts consumer always reads the current value at commit/restore time.
let activeAdapter: HistoryAdapter = defaultHistoryAdapter;

/** The installed history adapter (read at commit/restore time). */
export function getHistoryAdapter(): HistoryAdapter {
  return activeAdapter;
}

/**
 * Install a history adapter. The tabs layer installs its app-aware adapter in
 * its wiring effect and restores `defaultHistoryAdapter` on teardown.
 */
export function setHistoryAdapter(adapter: HistoryAdapter): void {
  activeAdapter = adapter;
}
