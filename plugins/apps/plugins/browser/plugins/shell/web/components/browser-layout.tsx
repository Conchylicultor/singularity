import { Bar } from "@plugins/primitives/plugins/bar/web";
import {
  Clip,
  clipClasses,
} from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Browser } from "../slots";
import { BrowserTabsStore } from "../nav-store";

/**
 * Inner layout — sits INSIDE `<BrowserTabsStore.Provider>` so its children (the
 * tab strip, chrome bars, sub-bar, viewport, effects) can read the per-surface
 * tab store.
 *
 * The chrome bar is a single-line row: leading nav controls, the flexible
 * omnibox in the truncating fill track, and the trailing actions cluster. The
 * outer shell is the full-surface column — a `Stack` that also clips, so it
 * takes `clipClasses()` rather than wrapping itself in a `<Clip>`.
 */
function BrowserInner() {
  return (
    <Stack
      gap="none"
      className={cn(
        "h-full bg-background",
        clipClasses({ axis: "both", fill: false }),
      )}
    >
      <Browser.TabStrip.Render />
      <Bar tier="chrome">
        <Line className="w-full gap-sm">
          <Browser.NavControls.Render />
          <Fill>
            <Browser.Omnibox.Render />
          </Fill>
          <Stack
            direction="row"
            gap="sm"
            align="center"
            justify="end"
            className={rigidClass()}
          >
            <Browser.Actions.Render />
          </Stack>
        </Line>
      </Bar>
      <Browser.SubBar.Render />
      <Clip as="main" fill>
        <Browser.Viewport.Render />
      </Clip>
      <Browser.Effects.Mount />
    </Stack>
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
