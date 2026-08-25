import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { usePaneStore } from "@plugins/primitives/plugins/pane/web";
import {
  Sonata,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Picker } from "./display-picker";

/**
 * The player header's own contributions (`sonataPlayerPane.Actions`). Each is a
 * self-contained, zero-prop component that reads the open-song / display state
 * from `useSonata()` and the display registry from `Sonata.Display` — so they
 * drop straight into the slot (no hand-rolled bar). Registered in the plugin
 * barrel; rendered by `PaneChrome` as the player pane's header.
 *
 * The song title is not among them: it is the pane's own title node — see
 * `panes.tsx`.
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
  // A plain row, with no bar of its own: this component IS one occupant of the
  // pane header's `AdaptiveBar` (`PaneChrome` wraps every header contribution in
  // an `AdaptiveBar.Item`), and one adaptive bar per row is the primitive's own
  // contract. The `⋯` that collapses these options when the header runs out of
  // room is the header's, so the eyebrow and its options travel together.
  return (
    <Stack direction="row" align="center" gap="sm">
      <SectionLabel>Display</SectionLabel>
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
  );
}
