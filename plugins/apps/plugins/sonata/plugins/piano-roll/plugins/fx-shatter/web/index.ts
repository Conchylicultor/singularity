import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGrain } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { lazyComponent } from "@plugins/primitives/plugins/lazy-component/web";
import { PianoRollFx } from "@plugins/apps/plugins/sonata/plugins/piano-roll/web";
import { fxShatterConfig } from "../shared/config";

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
      // Lazy + headless (renders null): keeps this effect's pixi.js off the
      // eager boot wave. Loads inside the already-lazy piano-roll subtree.
      component: lazyComponent(
        () => import("./internal/fx-shatter").then((m) => ({ default: m.NoteShatterFx })),
        { fallback: null },
      ),
    }),
    ConfigV2.WebRegister({ descriptor: fxShatterConfig }),
  ],
} satisfies PluginDefinition;
