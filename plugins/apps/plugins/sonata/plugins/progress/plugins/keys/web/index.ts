import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataProgress } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import { KeyFlags } from "./components/key-flags";

export default {
  name: "Sonata: Progress Keys",
  description:
    "Sonata progress marker: key-signature flags along the progression bar (starting key + 'key' annotation changes).",
  contributions: [
    SonataProgress.Marker({ id: "keys", component: KeyFlags }),
  ],
} satisfies PluginDefinition;
