import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { transportShortcuts } from "./shortcuts";

export default {
  description:
    "Keyboard transport for Sonata: Space toggles play/pause, ←/→ seek the playhead, ↑/↓ speed up / slow down tempo.",
  contributions: transportShortcuts,
} satisfies PluginDefinition;
