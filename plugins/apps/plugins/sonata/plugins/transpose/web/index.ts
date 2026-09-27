import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Sonata,
  transposeSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { sonataPlayerPane } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { TransposeObserver } from "./components/transpose-observer";
import { TransposeControl } from "./components/transpose-control";

export { saveTranspose } from "./actions";

export default {
  description:
    "Per-song global transpose offset: persists a semitone shift, registers it with the shell's score pipeline as a per-song setting (Sonata.SongSetting) settled by a headless observer, and exposes a toolbar stepper control.",
  contributions: [
    Sonata.SongSetting({
      id: "transpose-sync",
      setting: transposeSetting,
      component: TransposeObserver,
    }),
    sonataPlayerPane.Actions({ id: "transpose", component: TransposeControl }),
  ],
} satisfies PluginDefinition;
