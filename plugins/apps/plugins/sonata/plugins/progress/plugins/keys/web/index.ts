import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataProgress } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import { KeyFlags } from "./components/key-flags";

export default {
  description:
    "Sonata progress marker: key-signature change markers along the progression bar — a strong vertical bar at each key change captioned by a small neutral key chip (starting key + 'key' annotation changes).",
  contributions: [
    SonataProgress.Marker({ id: "keys", component: KeyFlags }),
  ],
} satisfies PluginDefinition;
