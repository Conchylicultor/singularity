import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Sonata,
  keyAutoDetectSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { KeyModeObserver } from "./components/key-mode-observer";

export { saveKeyAutoDetect } from "./actions";

export default {
  description:
    "Per-song key-source mode: persists a toggle to override an authored (MIDI) key with auto-detection, and registers it with the shell's score pipeline as a per-song setting (Sonata.SongSetting) settled by a headless observer.",
  contributions: [
    Sonata.SongSetting({
      id: "key-mode-sync",
      setting: keyAutoDetectSetting,
      component: KeyModeObserver,
    }),
  ],
} satisfies PluginDefinition;
