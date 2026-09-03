import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { defineInstallSink } from "./internal/define-install-sink";
export type {
  FilledInstallSink,
  InstallSink,
  InstallSinkOptions,
} from "./internal/define-install-sink";

export default {
  description:
    "Installed-sink primitive: defineInstallSink declares the module-level slot a higher layer installs an implementation into and a lower layer calls (the navigator, the history adapter, the overlay fallback). Presence is answerable from render ONLY through the subscribed useInstalled(), so a late install re-renders whoever asked early; the imperative sample is named peek… so install-sink/no-render-phase-peek can keep it out of render.",
  contributions: [],
} satisfies PluginDefinition;
