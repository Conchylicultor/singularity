import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdRocketLaunch } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { PianoRollFx } from "@plugins/apps/plugins/sonata/plugins/piano-roll/web";
import { fxCometsConfig } from "../shared/config";
import { PitchCometsFx } from "./internal/fx-comets";

export default {
  description:
    "Fancy piano-roll FX (opt-in): a comet arcs along the keyboard line between consecutive notes of the same track, with a fading particle trail.",
  contributions: [
    PianoRollFx({
      id: "fx-comets",
      label: "Pitch comets",
      icon: MdRocketLaunch,
      tier: "fancy",
      config: fxCometsConfig,
      component: PitchCometsFx,
    }),
    ConfigV2.WebRegister({ descriptor: fxCometsConfig }),
  ],
} satisfies PluginDefinition;
