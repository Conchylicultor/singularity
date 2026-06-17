import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Browser } from "../slots";
import { BrowserNavStore } from "../nav-store";

/**
 * Inner layout — sits INSIDE `<BrowserNavStore.Provider>` so its children (the
 * chrome bars, sub-bar, viewport, effects) can read the per-surface nav store.
 *
 * The chrome bar is a `<Frame>`: leading nav controls, the flexible omnibox in
 * the truncating `content` track, and the trailing actions cluster. The outer
 * shell is the irreducible full-surface column (toolbar rows + a filling,
 * clipping main) — the one shape no css primitive expresses, so its flex-fill
 * mechanics carry per-site escapes.
 */
function BrowserInner() {
  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- full-surface app column: a filling, clipping vertical shell that no css primitive expresses.
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Bar tier="chrome">
        <Frame
          className="w-full"
          leading={<Browser.NavControls.Render />}
          content={<Browser.Omnibox.Render />}
          trailing={<Browser.Actions.Render />}
        />
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
 * The browser app layout. Mounts the per-surface navigation store provider;
 * the store is consumed only inside `<BrowserInner/>` (a Provider host cannot
 * read its own store in its body).
 */
export function BrowserLayout() {
  return (
    <BrowserNavStore.Provider>
      <BrowserInner />
    </BrowserNavStore.Provider>
  );
}
