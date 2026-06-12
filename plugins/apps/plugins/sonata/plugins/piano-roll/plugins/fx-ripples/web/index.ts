import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdWifiTethering } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { PianoRollFx } from "@plugins/apps/plugins/sonata/plugins/piano-roll/web";
import { fxRipplesConfig } from "../shared/config";
import { SoundWaveRipplesFx } from "./internal/fx-ripples";

export default {
  description:
    "Fancy piano-roll FX (opt-in): expanding sound-wave ripple rings from each note strike, chords merging into one stronger ripple.",
  contributions: [
    PianoRollFx({
      id: "fx-ripples",
      label: "Sound-wave ripples",
      icon: MdWifiTethering,
      tier: "fancy",
      config: fxRipplesConfig,
      component: SoundWaveRipplesFx,
    }),
    ConfigV2.WebRegister({ descriptor: fxRipplesConfig }),
  ],
} satisfies PluginDefinition;
