import { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// Surface id context. Carries the stable per-surface-instance id (the tab's
// `tabId`) so consumers can read "which surface I'm rendered in" without
// touching `window.location` — keyboard-shortcut focus-scoping and per-surface
// stores (see `scoped-store`) key off this. `undefined` outside any surface
// provider (e.g. `PaneSurfaceProvider`).
//
// Lives in its own leaf plugin rather than `pane` so low-level primitives like
// `shortcuts` can read it without importing `pane`: the graph already has
// `pane → icon-button → shortcuts`, so a `shortcuts → pane` edge would close a
// cycle. Both `pane` (provider) and `shortcuts` (reader) import this leaf.
// ---------------------------------------------------------------------------

export const SurfaceIdContext = createContext<string | undefined>(undefined);

export function useSurfaceTabId(): string | undefined {
  return useContext(SurfaceIdContext);
}
