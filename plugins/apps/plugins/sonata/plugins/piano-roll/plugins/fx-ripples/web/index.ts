import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdWifiTethering } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { lazyComponent } from "@plugins/primitives/plugins/lazy-component/web";
import { PianoRollFx } from "@plugins/apps/plugins/sonata/plugins/piano-roll/web";
import { fxRipplesConfig } from "../shared/config";

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
      // Lazy + headless (renders null): keeps this effect's pixi.js off the
      // eager boot wave. Loads inside the already-lazy piano-roll subtree.
      component: lazyComponent(
        () => import("./internal/fx-ripples").then((m) => ({ default: m.SoundWaveRipplesFx })),
        { fallback: null },
      ),
    }),
    ConfigV2.WebRegister({ descriptor: fxRipplesConfig }),
  ],
} satisfies PluginDefinition;
