import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { UltimateGuitarLoader } from "../loader";
import { UG_SOURCE_ID } from "../constants";

/**
 * In-player editor for an Ultimate Guitar song, contributed to `Sonata.Section`
 * (`area: "editor"`). Mounts the `UltimateGuitarLoader`, writing the fetched
 * `UgTab` straight into the context (`setSourceRaw` → live score recompile).
 * Renders only for songs that carry UG data (`sourceRaw` defined), so it stays
 * hidden for other sources.
 *
 * Unlike the chord-grid editor, this does NOT debounce-persist to the server:
 * UG library persistence (the side-table, the create affordance, and hydration)
 * is a later task, so today this section is reachable only once a UG song is the
 * visible source.
 */
export function UltimateGuitarEditorSection() {
  const { sourceRaw, setSourceRaw } = useSonata();

  const rawValue = sourceRaw(UG_SOURCE_ID);

  // Gate to Ultimate Guitar songs only (hook above always runs — rules-of-hooks safe).
  if (rawValue === undefined) return null;

  return (
    <Card className="rounded-lg p-lg">
      <UltimateGuitarLoader
        raw={rawValue}
        onRaw={(r) => setSourceRaw(UG_SOURCE_ID, r)}
      />
    </Card>
  );
}
