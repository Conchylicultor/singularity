import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGrain } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { PianoRollFx } from "@plugins/apps/plugins/sonata/plugins/piano-roll/web";
import { fxShatterConfig } from "../shared/config";
import { NoteShatterFx } from "./internal/fx-shatter";

export default {
  description:
    "Fancy piano-roll FX (opt-in): notes shatter into tinted debris that arcs up and falls under gravity at the strike line.",
  contributions: [
    PianoRollFx({
      id: "fx-shatter",
      label: "Note shatter",
      icon: MdGrain,
      tier: "fancy",
      config: fxShatterConfig,
      component: NoteShatterFx,
    }),
    ConfigV2.WebRegister({ descriptor: fxShatterConfig }),
  ],
} satisfies PluginDefinition;
