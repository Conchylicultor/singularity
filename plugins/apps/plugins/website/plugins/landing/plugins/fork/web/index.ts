import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { ForkSection } from "./components/fork-section";

export default {
  description:
    "Landing fork band: the homepage's two questions as two side-by-side click targets, each opening its own answer page.",
  contributions: [
    Website.Section({ id: "fork", label: "Fork", component: ForkSection }),
  ],
} satisfies PluginDefinition;
