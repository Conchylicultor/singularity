import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { pitchLayoutConfig } from "../core/config";

export { usePitchGeometry } from "./internal/use-pitch-geometry";

// Registration + one view-option contribution is the WHOLE UI: the view-options
// chip renders enum fields generically through FieldRenderer, so the Keyboard
// layout switch appears in the player's View popover (and in Settings → Config)
// with no component of its own — the same shape the Look switch has.
//
// Scoped to `piano-roll`: the layout parameterises that lens's note columns,
// grid rules and keyboard. Another display would have to opt in here.
export default {
  description:
    "Web registration of the Sonata pitch-layout config (piano / Jankó) plus its View-popover switch, and usePitchGeometry() — the one read every keyboard renderer makes for the active layout's plane.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: pitchLayoutConfig }),
    Sonata.ViewOption({
      id: "pitch-layout",
      displays: ["piano-roll"],
      config: pitchLayoutConfig,
    }),
  ],
} satisfies PluginDefinition;
