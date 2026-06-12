import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataProgress } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import { KeyFlags } from "./components/key-flags";

export default {
  description:
    "Sonata progress marker: key-signature regions along the progression bar — each key span tinted by key identity with a highlighted vertical bar at the change (starting key + 'key' annotation changes).",
  contributions: [
    SonataProgress.Marker({ id: "keys", component: KeyFlags }),
  ],
} satisfies PluginDefinition;
