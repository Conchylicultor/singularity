import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Picker } from "./display-picker";

/**
 * The player toolbar's leading (`Sonata.Toolbar.Start`) contributions. Each is a
 * self-contained, zero-prop component that reads the open-song / display state
 * from `useSonata()` and the display registry from `Sonata.Display` — so they
 * drop straight into the render-slot host (no hand-rolled bar). Registered in
 * the plugin barrel; rendered by `<Sonata.Toolbar.Host/>` in the player surface.
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

/** The open song's title (falls back to the optimistic "Untitled"). */
export function SongTitle() {
  const { currentSongTitle } = useSonata();
  return (
    <Text variant="body" className="font-semibold text-foreground">
      {currentSongTitle ?? "Untitled"}
    </Text>
  );
}

/**
 * Display selector: the "Display" eyebrow + the picker over the `Sonata.Display`
 * contributions. Collection-consumer clean — enumerates the dispatch slot's
 * metadata, never naming a contributor.
 */
export function DisplayPicker() {
  const { activeDisplayId, setActiveDisplay } = useSonata();
  const displays = Sonata.Display.useContributions();
  const effectiveDisplayId = activeDisplayId ?? displays[0]?.id ?? null;
  return (
    <Stack direction="row" align="center" gap="sm">
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Display
      </span>
      <Picker
        items={displays.map((d) => ({ id: d.id, label: d.label, icon: d.icon }))}
        activeId={effectiveDisplayId}
        onSelect={setActiveDisplay}
        empty="No displays"
      />
    </Stack>
  );
}
