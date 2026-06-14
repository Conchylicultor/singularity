import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { surfaceArrangementWeb } from "./region";

export { SurfaceArrangement } from "./region";

export default {
  description:
    "Surface-arrangement region (tabs / desktop). Contributes its variant-region host into Apps.SurfaceArrangement.",
  contributions: [
    ...surfaceArrangementWeb.contributions,
    Apps.SurfaceArrangement({ component: surfaceArrangementWeb.Region }),
  ],
} satisfies PluginDefinition;
