import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { sonataLookConfig } from "../core/config";

// Registration + one view-option contribution is the WHOLE UI: the view-options
// chip renders enum fields generically through FieldRenderer, so the Look switch
// appears in the player's View popover (and in Settings → Config) with no
// component of its own. It is the ONE appearance row there — the keyboard's
// separate flat/realistic switch folded into this list.
//
// Scoped to `piano-roll`: the look parameterises that lens's lane, grid, notes
// and keyboard. Another display would have to opt in here.
export default {
  description:
    "Web registration of the Sonata look config (flat / realistic / sketch) plus its View-popover switch — the app's single appearance choice. The palette itself is plain data in core/.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: sonataLookConfig }),
    Sonata.ViewOption({
      id: "look",
      displays: ["piano-roll"],
      config: sonataLookConfig,
    }),
  ],
} satisfies PluginDefinition;
