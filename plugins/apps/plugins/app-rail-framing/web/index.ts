import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { appRailFramingWeb } from "./region";

export { AppRailFraming } from "./region";

export default {
  description:
    "App-rail framing region (rail / hidden). Contributes its variant-region host into Apps.RailFraming.",
  contributions: [
    ...appRailFramingWeb.contributions,
    Apps.RailFraming({ component: appRailFramingWeb.Region }),
  ],
} satisfies PluginDefinition;
