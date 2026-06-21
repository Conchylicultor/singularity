import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Browser } from "../slots";
import { BrowserTabsStore } from "../nav-store";

/**
 * Inner layout — sits INSIDE `<BrowserTabsStore.Provider>` so its children (the
 * tab strip, chrome bars, sub-bar, viewport, effects) can read the per-surface
 * tab store.
 *
 * The chrome bar is a flex row: leading nav controls, the flexible omnibox in
 * the truncating fill track, and the trailing actions cluster. The outer
 * shell is the irreducible full-surface column (toolbar rows + a filling,
 * clipping main) — the one shape no css primitive expresses, so its flex-fill
 * mechanics carry per-site escapes.
 */
function BrowserInner() {
  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- full-surface app column: a filling, clipping vertical shell that no css primitive expresses.
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Browser.TabStrip.Render />
      <Bar tier="chrome">
        <div className="flex w-full items-center gap-sm whitespace-nowrap">
          <Browser.NavControls.Render />
          <div className="min-w-0 flex-1">
            <Browser.Omnibox.Render />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-sm">
            <Browser.Actions.Render />
          </div>
        </div>
      </Bar>
      <Browser.SubBar.Render />
      {/* eslint-disable-next-line layout/no-adhoc-layout -- main fills the remaining column height and clips overflow; no css primitive expresses a vertical fill track. */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <Browser.Viewport.Render />
      </main>
      <Browser.Effects.Mount />
    </div>
  );
}

/**
 * The browser app layout. Mounts the per-surface tab store provider; the store
 * is consumed only inside `<BrowserInner/>` (a Provider host cannot read its own
 * store in its body).
 */
export function BrowserLayout() {
  return (
    <BrowserTabsStore.Provider>
      <BrowserInner />
    </BrowserTabsStore.Provider>
  );
}
