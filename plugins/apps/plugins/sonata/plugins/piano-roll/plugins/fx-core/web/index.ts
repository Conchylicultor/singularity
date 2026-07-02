import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdFlare } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { lazyComponent } from "@plugins/primitives/plugins/lazy-component/web";
import { PianoRollFx } from "@plugins/apps/plugins/sonata/plugins/piano-roll/web";
import { fxCoreConfig } from "../shared/config";

export default {
  description:
    "Ambient piano-roll FX (on by default): key-strike glow, rising sparks, and an active-note brighten over the sounding bar.",
  contributions: [
    PianoRollFx({
      id: "fx-core",
      label: "Note glow & sparks",
      icon: MdFlare,
      tier: "ambient",
      config: fxCoreConfig,
      // Lazy + headless (renders null): keeps this effect's pixi.js off the
      // eager boot wave. Loads inside the already-lazy piano-roll subtree.
      component: lazyComponent(
        () => import("./internal/fx-core").then((m) => ({ default: m.NoteGlowSparksFx })),
        { fallback: null },
      ),
    }),
    ConfigV2.WebRegister({ descriptor: fxCoreConfig }),
  ],
} satisfies PluginDefinition;
