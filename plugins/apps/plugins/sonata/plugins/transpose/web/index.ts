import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { sonataPlayerPane } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { TransposeObserver } from "./components/transpose-observer";
import { TransposeControl } from "./components/transpose-control";

export { saveTranspose } from "./actions";

export default {
  description:
    "Per-song global transpose offset: persists a semitone shift, syncs it into the shell's score pipeline via a headless Sonata.Effect observer, and exposes a toolbar stepper control.",
  contributions: [
    Sonata.Effect({ id: "transpose-sync", component: TransposeObserver }),
    sonataPlayerPane.Actions({ id: "transpose", component: TransposeControl }),
  ],
} satisfies PluginDefinition;
