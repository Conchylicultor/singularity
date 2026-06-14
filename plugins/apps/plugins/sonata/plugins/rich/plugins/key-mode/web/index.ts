import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { KeyModeObserver } from "./components/key-mode-observer";

export { saveKeyAutoDetect } from "./actions";

export default {
  description:
    "Per-song key-source mode: persists a toggle to override an authored (MIDI) key with auto-detection, and syncs it into the shell's score pipeline via a headless Sonata.Effect observer.",
  contributions: [
    Sonata.Effect({ id: "key-mode-sync", component: KeyModeObserver }),
  ],
} satisfies PluginDefinition;
