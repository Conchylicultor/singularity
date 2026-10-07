import { useState } from "react";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { ColorPicker } from "@plugins/primitives/plugins/css/plugins/color-picker/web";

/** The suggestions a prototype's `accent: color …` option declares. */
const ACCENT_SUGGESTIONS = [
  { name: "violet", color: "#7c5cff" },
  { name: "azure", color: "#3b82f6" },
  { name: "mint", color: "#10b981" },
  { name: "coral", color: "#f0614b" },
  { name: "ink", color: "#22212a" },
];

/**
 * The picker twice, side by side: as a prototype's color option drives it
 * (title, named suggestions, a default to reset to) and as a theme token with
 * opacity drives it. Local state only — it never writes anything.
 */
export default function ColorPickerExhibit() {
  const [accent, setAccent] = useState("#7c5cff");
  const [shadow, setShadow] = useState("oklch(0.2 0.02 270 / 0.4)");
  return (
    <Cluster gap="md" align="start">
      <Surface level="overlay">
        <ColorPicker
          title="Accent"
          value={accent}
          onChange={setAccent}
          swatches={ACCENT_SUGGESTIONS}
          defaultValue="#7c5cff"
        />
      </Surface>
      <Surface level="overlay">
        <ColorPicker
          title="Shadow"
          value={shadow}
          onChange={setShadow}
          showAlpha
        />
      </Surface>
    </Cluster>
  );
}
