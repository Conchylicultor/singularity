import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { usePaneStore } from "@plugins/primitives/plugins/pane/web";
import {
  Sonata,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Picker } from "./display-picker";

/**
 * The player toolbar's leading (`Sonata.Toolbar.Start`) contributions. Each is a
 * self-contained, zero-prop component that reads the open-song / display state
 * from `useSonata()` and the display registry from `Sonata.Display` — so they
 * drop straight into the render-slot host (no hand-rolled bar). Registered in
 * the plugin barrel; rendered by `PaneChrome` as the player pane's header (the
 * pane sets `chrome: { header: SonataToolbar }`).
 */

/** ← Library — clears the route back to the library index pane. */
export function BackToLibrary() {
  const store = usePaneStore();
  return (
    <Button variant="outline" onClick={() => store.clearRoute()}>
      ← Library
    </Button>
  );
}

/**
 * Display selector: the "Display" eyebrow + the picker over the `Sonata.Display`
 * contributions. Collection-consumer clean — enumerates the dispatch slot's
 * metadata, never naming a contributor.
 */
export function DisplayPicker() {
  const { effectiveDisplayId, setActiveDisplay } = useSonata();
  const displays = Sonata.Display.useContributions();
  // `<Fill>` is one link of the chain that hands the picker room: the
  // `AdaptiveBar` inside `Picker` asks for the row's slack, the ask crosses this
  // box up to the slot cell, and the cell grows because it was asked — `Fill`
  // then relays that grow (and the shrink) back down. Nothing is declared
  // anywhere. The eyebrow stays rigid so the bar takes all of the slack.
  return (
    <Fill>
      <Stack direction="row" align="center" gap="sm">
        <SectionLabel className={rigidClass()}>Display</SectionLabel>
        <Picker
          items={displays.map((d) => ({
            id: d.id,
            label: d.label,
            icon: d.icon,
          }))}
          activeId={effectiveDisplayId}
          onSelect={setActiveDisplay}
          empty="No displays"
        />
      </Stack>
    </Fill>
  );
}
