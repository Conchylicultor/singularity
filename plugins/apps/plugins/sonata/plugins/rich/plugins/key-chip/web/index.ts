import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { KeyChip } from "./components/key-chip";

export default {
  description:
    "Sonata Hud: current-key chip overlaid on the display, tracking the playback cursor. Reads the shared Score + cursor via useSonata().",
  contributions: [Sonata.Hud({ id: "key-chip", component: KeyChip })],
} satisfies PluginDefinition;
